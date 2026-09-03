-- ============================================================
-- VíaSegura — Lógica de negocio (funciones, triggers, cron)
-- Ejecutar DESPUÉS de viasegura_schema.sql
-- ============================================================

-- ---------- EXTENSIÓN pg_cron ----------
-- En Supabase hosted, si esto falla por permisos, actívala primero desde
-- Database → Extensions → buscar "pg_cron" → Enable, y luego reintenta.
create extension if not exists pg_cron with schema extensions;

-- ============================================================
-- 1. CREACIÓN DE PERMISO CON MANEJO DE CONFLICTO (sección 6.4)
--    Si el exclusion constraint se dispara, el permiso entra directo
--    a EN_COLA_ESPERA en vez de fallar la transacción completa.
-- ============================================================
create or replace function fn_crear_permiso(
  p_usuario_id uuid,
  p_rut_ejecutor text,
  p_comuna_id uuid,
  p_tipo_actividad tipo_actividad,
  p_area geometry,
  p_ventana_inicio timestamptz,
  p_ventana_fin timestamptz,
  p_empresa_ejecutora_id uuid default null,
  p_nombre_empresa_ejecutora text default null,
  p_altura_estimada_m numeric default null
) returns permiso as $$
declare
  v_permiso permiso;
begin
  insert into permiso (
    usuario_id, rut_ejecutor, empresa_ejecutora_id, nombre_empresa_ejecutora,
    comuna_id, tipo_actividad, area, ventana_inicio, ventana_fin, altura_estimada_m
  ) values (
    p_usuario_id, p_rut_ejecutor, p_empresa_ejecutora_id, p_nombre_empresa_ejecutora,
    p_comuna_id, p_tipo_actividad, p_area, p_ventana_inicio, p_ventana_fin, p_altura_estimada_m
  )
  returning * into v_permiso;

  return v_permiso;

exception when exclusion_violation then
  insert into permiso (
    usuario_id, rut_ejecutor, empresa_ejecutora_id, nombre_empresa_ejecutora,
    comuna_id, tipo_actividad, area, ventana_inicio, ventana_fin, altura_estimada_m,
    estado, motivo_cola
  ) values (
    p_usuario_id, p_rut_ejecutor, p_empresa_ejecutora_id, p_nombre_empresa_ejecutora,
    p_comuna_id, p_tipo_actividad, p_area, p_ventana_inicio, p_ventana_fin, p_altura_estimada_m,
    'EN_COLA_ESPERA', 'CONFLICTO_RESERVA'
  )
  returning * into v_permiso;

  return v_permiso;
end;
$$ language plpgsql;

-- ============================================================
-- 2. VISTA DE COLA ORDENADA (secciones 6.1 y 6.4)
--    Prioridad: EMERGENCIA > menor score de riesgo > orden de llegada.
--    Un solo motor de colas, dos triggers distintos (motivo_cola los distingue).
-- ============================================================
create or replace view v_cola_espera as
select
  p.*,
  er.score as ultimo_score
from permiso p
left join lateral (
  select score from evaluacion_riesgo e
  where e.permiso_id = p.id
  order by evaluado_at desc
  limit 1
) er on true
where p.estado = 'EN_COLA_ESPERA'
order by
  (p.tipo_actividad = 'EMERGENCIA') desc,
  er.score asc nulls last,
  p.created_at asc;

-- ============================================================
-- 3. SLA AUTOMÁTICO AL ENTRAR A PENDIENTE_CONFIRMACION_MUNICIPAL
--    Calcula el vencimiento usando el SLA configurado por comuna.
-- ============================================================
create or replace function fn_set_sla_vencimiento()
returns trigger as $$
begin
  if new.estado = 'PENDIENTE_CONFIRMACION_MUNICIPAL' and
     (old is null or old.estado is distinct from new.estado) then
    select now() + (sla_confirmacion_min * interval '1 minute')
      into new.sla_vencimiento
      from comuna where id = new.comuna_id;
  elsif new.estado = 'EN_COLA_ESPERA' and new.motivo_cola = 'RIESGO_ALTO_SIN_MOVIL' and
        (old is null or old.estado is distinct from new.estado) then
    select now() + (sla_escolta_min * interval '1 minute')
      into new.sla_vencimiento
      from comuna where id = new.comuna_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_permiso_sla
before insert or update on permiso
for each row execute function fn_set_sla_vencimiento();

-- ============================================================
-- 4. CONFIRMACIÓN POR SILENCIO ADMINISTRATIVO (Ley 19.880, riesgo bajo)
-- ============================================================
create or replace function fn_confirmar_silencio_administrativo()
returns void as $$
begin
  update permiso
  set estado = 'APROBADO'
  where estado = 'PENDIENTE_CONFIRMACION_MUNICIPAL'
    and sla_vencimiento is not null
    and sla_vencimiento < now();
end;
$$ language plpgsql;

-- ============================================================
-- 5. EXPIRACIÓN AUTOMÁTICA (sección 6.2)
--    Aprobado que no activó dentro de ventana + tolerancia → Expirado.
-- ============================================================
create or replace function fn_expirar_permisos_vencidos()
returns void as $$
begin
  update permiso
  set estado = 'EXPIRADO'
  where estado = 'APROBADO'
    and geofencing_confirmado_at is null
    and (ventana_inicio + (tolerancia_activacion_min * interval '1 minute')) < now();
end;
$$ language plpgsql;

-- ============================================================
-- 6. CRON JOBS (cada 1 minuto)
-- ============================================================
select cron.schedule(
  'confirmar-silencio-administrativo',
  '* * * * *',
  $$select fn_confirmar_silencio_administrativo();$$
);

select cron.schedule(
  'expirar-permisos-vencidos',
  '* * * * *',
  $$select fn_expirar_permisos_vencidos();$$
);

-- ============================================================
-- 7. BITÁCORA AUTOMÁTICA — cada cambio de estado queda en historial_eventos
-- ============================================================
create or replace function fn_log_cambio_estado_permiso()
returns trigger as $$
begin
  if (tg_op = 'UPDATE' and new.estado is distinct from old.estado) or tg_op = 'INSERT' then
    insert into historial_eventos (permiso_id, comuna_id, tipo_evento, detalle)
    values (
      new.id, new.comuna_id, 'CAMBIO_ESTADO_PERMISO',
      jsonb_build_object(
        'estado_anterior', case when tg_op = 'UPDATE' then old.estado else null end,
        'estado_nuevo', new.estado,
        'motivo_cola', new.motivo_cola
      )
    );
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_log_estado_permiso
after insert or update on permiso
for each row execute function fn_log_cambio_estado_permiso();

create or replace function fn_log_cambio_estado_alerta()
returns trigger as $$
begin
  if (tg_op = 'UPDATE' and new.estado is distinct from old.estado) or tg_op = 'INSERT' then
    insert into historial_eventos (permiso_id, comuna_id, tipo_evento, detalle)
    select
      new.permiso_id, p.comuna_id, 'CAMBIO_ESTADO_ALERTA_PANICO',
      jsonb_build_object(
        'estado_anterior', case when tg_op = 'UPDATE' then old.estado else null end,
        'estado_nuevo', new.estado,
        'origen', new.origen
      )
    from permiso p where p.id = new.permiso_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_log_estado_alerta
after insert or update on alerta_panico
for each row execute function fn_log_cambio_estado_alerta();