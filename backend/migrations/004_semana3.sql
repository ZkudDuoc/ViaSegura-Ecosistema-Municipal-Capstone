-- ============================================================
-- VíaSegura — Semana 3: cola con prioridad + reprogramación automática,
-- revocación, cascada de resiliencia del pánico, bitácora.
-- Ejecutar DESPUÉS de 001_schema.sql, 002_logica.sql y 003_auth_password.sql
-- ============================================================

-- ---------- 1. Teléfonos de alerta por comuna (fallback SMS del pánico) ----------
alter table comuna add column if not exists telefonos_alerta text[] not null default '{}';

-- ---------- 2. Cola local de pánico (último escalón de la cascada) ----------
-- Si ni el WebSocket (operador conectado) ni el SMS pudieron confirmar la
-- alerta, queda encolada aquí para que un operador la vea/reintente al
-- conectarse o para un job de reintento.
create table if not exists panico_cola_local (
  id             uuid primary key default gen_random_uuid(),
  alerta_panico_id uuid not null references alerta_panico(id) on delete cascade,
  comuna_id      uuid not null references comuna(id),
  payload        jsonb not null,
  intentos       int not null default 0,
  procesado      boolean not null default false,
  procesado_por  uuid references usuario(id),
  procesado_at   timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists idx_panicocola_comuna_pendiente
  on panico_cola_local (comuna_id, procesado, created_at);

-- ============================================================
-- 3. REPROGRAMACIÓN AUTOMÁTICA DE LA COLA DE ESPERA (motivo CONFLICTO_RESERVA)
--    Reintenta, en orden de prioridad (v_cola_espera), promover cada permiso
--    en cola fuera de EN_COLA_ESPERA. Si el conflicto espacio-temporal ya se
--    liberó, el exclusion constraint deja pasar el UPDATE; si sigue vigente,
--    se relanza exclusion_violation y el permiso permanece en la cola.
-- ============================================================
create or replace function fn_reprogramar_cola()
returns void as $$
declare
  v_permiso record;
begin
  for v_permiso in
    select id from v_cola_espera where motivo_cola = 'CONFLICTO_RESERVA'
  loop
    begin
      update permiso
      set estado = 'PENDIENTE_CONFIRMACION_MUNICIPAL', motivo_cola = null
      where id = v_permiso.id and estado = 'EN_COLA_ESPERA';
    exception when exclusion_violation then
      -- Sigue en conflicto: se mantiene en EN_COLA_ESPERA para el próximo intento.
      null;
    end;
  end loop;
end;
$$ language plpgsql;

select cron.schedule(
  'reprogramar-cola-espera',
  '* * * * *',
  $$select fn_reprogramar_cola();$$
);

-- ============================================================
-- 4. REPROGRAMACIÓN AL ASIGNAR MÓVIL (motivo RIESGO_ALTO_SIN_MOVIL)
--    Cuando se asigna un móvil de escolta a un permiso que estaba en cola
--    esperando móvil, sale de la cola y entra a confirmación municipal.
-- ============================================================
create or replace function fn_promover_desde_cola_por_movil()
returns trigger as $$
begin
  if new.permiso_id is not null then
    update permiso
    set estado = 'PENDIENTE_CONFIRMACION_MUNICIPAL', motivo_cola = null
    where id = new.permiso_id
      and estado = 'EN_COLA_ESPERA'
      and motivo_cola = 'RIESGO_ALTO_SIN_MOVIL';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_promover_desde_cola_por_movil
after insert on movil_asignado
for each row execute function fn_promover_desde_cola_por_movil();
