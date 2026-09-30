-- ============================================================
-- VíaSegura — Semana 5, Bloque 3: checklist de inspección en terreno y
-- facultades del supervisor (aprobar faena, cursar infracción ya existía
-- desde antes vía tabla `infraccion`, suspender de inmediato).
-- Ejecutar DESPUÉS de 006..008.
-- ============================================================

create type resultado_inspeccion as enum ('CONFORME', 'NO_CONFORME', 'SUSPENDIDA');

create table if not exists inspeccion (
  id                     uuid primary key default gen_random_uuid(),
  permiso_id             uuid not null references permiso(id) on delete cascade,
  inspector_id           uuid not null references usuario(id),
  senaletica_ok          boolean not null default false,
  epp_ok                 boolean not null default false,
  operarios_coinciden    boolean not null default false,
  patente_coincide       boolean not null default false,
  resultado              resultado_inspeccion not null,
  observaciones          text,
  created_at             timestamptz not null default now()
);

create index if not exists idx_inspeccion_permiso on inspeccion (permiso_id, created_at);
