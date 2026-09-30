-- ============================================================
-- VíaSegura — Semana 5, Bloque 1 (continuación). Ejecutar DESPUÉS de
-- 006_semana5_bloque1.sql (los nuevos valores del enum deben existir ya
-- en un commit separado antes de usarse acá).
-- ============================================================

-- ---------- 1. Personal en faena (RUT, contrato vigente, EPP al día) ----------
create table if not exists personal_faena (
  id                uuid primary key default gen_random_uuid(),
  permiso_id        uuid not null references permiso(id) on delete cascade,
  rut               text not null,
  nombre            text,
  contrato_vigente  boolean not null default false,
  epp_al_dia        boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists idx_personalfaena_permiso on personal_faena (permiso_id);

-- ---------- 2. Maquinaria/vehículos adicionales del permiso ----------
-- `permiso.vehiculo_id` sigue siendo el vehículo principal (compatibilidad);
-- esta tabla permite declarar vehículos/maquinaria adicionales del mismo permiso.
create table if not exists permiso_vehiculo (
  permiso_id   uuid not null references permiso(id) on delete cascade,
  vehiculo_id  uuid not null references vehiculo(id),
  created_at   timestamptz not null default now(),
  primary key (permiso_id, vehiculo_id)
);

-- ---------- 3. Expiración automática de servicios ACTIVOS cuya ventana ya pasó ----------
-- Distinto de fn_expirar_permisos_vencidos (esa es para APROBADO que nunca
-- se activó dentro de la tolerancia). Esta es para servicios ya en terreno
-- cuya ventana_fin quedó atrás sin que el chofer finalizara manualmente —
-- evita que el mapa del operador se llene de servicios "activos" vencidos.
create or replace function fn_expirar_permisos_activos_vencidos()
returns void as $$
begin
  update permiso
  set estado = 'EXPIRADO'
  where estado in ('ACTIVO', 'ACTIVO_PENDIENTE_EVIDENCIA')
    and ventana_fin < now();
end;
$$ language plpgsql;

select cron.schedule(
  'expirar-permisos-activos-vencidos',
  '* * * * *',
  $$select fn_expirar_permisos_activos_vencidos();$$
);
