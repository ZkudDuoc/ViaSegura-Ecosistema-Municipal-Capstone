-- ============================================================
-- VíaSegura — Esquema de Base de Datos (Supabase / PostgreSQL + PostGIS)
-- ============================================================

-- ---------- EXTENSIONES ----------
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "postgis";
create extension if not exists "btree_gist";    -- necesario para exclusion constraint mixta (=, &&)

-- ---------- ENUMS ----------
create type rol_usuario as enum ('CHOFER', 'LOGISTICA', 'OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL');
create type tipo_actividad as enum ('PROGRAMADA', 'EMERGENCIA');
create type nivel_riesgo as enum ('BAJO', 'MEDIO', 'ALTO');
create type estado_permiso as enum (
  'PENDIENTE_CONFIRMACION_MUNICIPAL',
  'APROBADO',
  'EN_COLA_ESPERA',
  'ACTIVO',
  'ACTIVO_PENDIENTE_EVIDENCIA',
  'FINALIZADO',
  'EXPIRADO',
  'REVOCADO'
);
create type motivo_cola as enum ('RIESGO_ALTO_SIN_MOVIL', 'CONFLICTO_RESERVA');
create type origen_alerta as enum ('APP', 'SMS', 'COLA_LOCAL');
create type estado_alerta as enum ('ACTIVA', 'ATENDIDO', 'ESCALADO');
create type accion_operador as enum ('ACEPTAR', 'ACEPTAR_SUGERENCIA', 'REVOCAR', 'ASIGNAR_SEGURIDAD');

-- ============================================================
-- 1. COMUNA
-- ============================================================
create table comuna (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null unique,
  sla_confirmacion_min  int not null default 30,   -- riesgo bajo: silencio administrativo
  sla_escolta_min       int not null default 60,   -- riesgo alto: espera de móvil
  created_at            timestamptz not null default now()
);

-- ============================================================
-- 2. EMPRESA
-- ============================================================
create table empresa (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  rut_empresa text not null unique,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 3. USUARIO
--    id = auth.users.id (asumiendo Supabase Auth). Ajustar si se usa otro proveedor.
-- ============================================================
create table usuario (
  id          uuid primary key default gen_random_uuid(),
  rol         rol_usuario not null,
  nombre      text not null,
  rut         text not null unique,
  email       text unique,
  empresa_id  uuid references empresa(id),
  comuna_id   uuid references comuna(id),
  created_at  timestamptz not null default now(),

  constraint usuario_rol_scope check (
    (rol in ('CHOFER','LOGISTICA')
      and empresa_id is not null and comuna_id is null)
    or
    (rol in ('OPERADOR_MUNICIPAL','INSPECTOR_MUNICIPAL')
      and comuna_id is not null and empresa_id is null)
  )
);

-- ============================================================
-- 4. PERMISO (núcleo del sistema)
-- ============================================================
create table permiso (
  id                          uuid primary key default gen_random_uuid(),

  -- identificación (3 identidades distintas, sección 6.6)
  usuario_id                  uuid not null references usuario(id),      -- quien solicita
  rut_ejecutor                text not null,                             -- quien ejecuta en terreno
  empresa_ejecutora_id        uuid references empresa(id),               -- si está registrada
  nombre_empresa_ejecutora    text,                                      -- si NO está registrada (subcontratista)

  comuna_id                   uuid not null references comuna(id),
  tipo_actividad               tipo_actividad not null,

  area                         geometry(Polygon, 4326) not null,
  altura_estimada_m            numeric,

  estado                       estado_permiso not null default 'PENDIENTE_CONFIRMACION_MUNICIPAL',
  motivo_cola                  motivo_cola,                              -- solo si estado = EN_COLA_ESPERA

  ventana_inicio                timestamptz not null,
  ventana_fin                   timestamptz not null,
  tolerancia_activacion_min     int not null default 15,

  foto_evidencia_url            text,
  geofencing_confirmado_at      timestamptz,
  sla_vencimiento                timestamptz,

  motivo_reintento               text,   -- riesgo medio/programada, tras 2 reintentos automáticos
  reintentos_realizados           int not null default 0,

  revocado_por                    uuid references usuario(id),           -- siempre humano (6.2)
  revocado_at                     timestamptz,

  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),

  constraint permiso_ventana_valida check (ventana_fin > ventana_inicio),
  constraint permiso_ejecutora_unica check (
    empresa_ejecutora_id is null or nombre_empresa_ejecutora is null
  )
);

-- Sin solape espacio-temporal dentro de la misma comuna, solo entre permisos "vivos" (6.4)
alter table permiso add constraint permiso_no_solape
  exclude using gist (
    comuna_id with =,
    area with &&,
    tstzrange(ventana_inicio, ventana_fin) with &&
  )
  where (estado in ('PENDIENTE_CONFIRMACION_MUNICIPAL','APROBADO','ACTIVO','ACTIVO_PENDIENTE_EVIDENCIA'));

create index idx_permiso_area on permiso using gist (area);
create index idx_permiso_comuna_estado on permiso (comuna_id, estado);
create index idx_permiso_usuario on permiso (usuario_id);

-- ============================================================
-- 5. EVALUACION_RIESGO (historial — un permiso puede re-evaluarse)
-- ============================================================
create table evaluacion_riesgo (
  id           uuid primary key default gen_random_uuid(),
  permiso_id   uuid not null references permiso(id) on delete cascade,
  score        numeric not null,
  nivel        nivel_riesgo not null,
  detalle      jsonb,               -- factores del modelo, zona roja involucrada, etc.
  evaluado_at  timestamptz not null default now()
);

create index idx_evalriesgo_permiso on evaluacion_riesgo (permiso_id, evaluado_at desc);

-- ============================================================
-- 6. INCIDENTE_DELICTIVO (dataset histórico/simulado)
-- ============================================================
create table incidente_delictivo (
  id          uuid primary key default gen_random_uuid(),
  comuna_id   uuid not null references comuna(id),
  ubicacion   geometry(Point, 4326) not null,
  tipo        text not null,
  fecha       timestamptz not null,
  fuente      text not null default 'SIMULADO',
  created_at  timestamptz not null default now()
);

create index idx_incidente_ubicacion on incidente_delictivo using gist (ubicacion);
create index idx_incidente_comuna on incidente_delictivo (comuna_id);

-- ============================================================
-- 7. ZONA_ROJA (salida del clustering ML, por comuna)
-- ============================================================
create table zona_roja (
  id            uuid primary key default gen_random_uuid(),
  comuna_id     uuid not null references comuna(id),
  area          geometry(Polygon, 4326) not null,
  score         numeric not null,
  tasa_normalizada numeric not null,   -- incidentes / población celda censal (sección 8)
  generado_at   timestamptz not null default now(),
  vigente_hasta timestamptz
);

create index idx_zonaroja_area on zona_roja using gist (area);
create index idx_zonaroja_comuna on zona_roja (comuna_id);

-- ============================================================
-- 8. ALERTA_PANICO (sub-estado paralelo, no reemplaza Activo — 6.2/6.3)
-- ============================================================
create table alerta_panico (
  id              uuid primary key default gen_random_uuid(),
  permiso_id      uuid not null references permiso(id),
  origen          origen_alerta not null,
  estado          estado_alerta not null default 'ACTIVA',
  ubicacion       geometry(Point, 4326),
  activado_at     timestamptz not null default now(),
  atendido_at     timestamptz,
  escalado_at     timestamptz,
  resuelto_por    uuid references usuario(id)
);

create index idx_alertapanico_permiso on alerta_panico (permiso_id);
create index idx_alertapanico_estado on alerta_panico (estado);

-- ============================================================
-- 9. MOVIL_ASIGNADO (escolta municipal — riesgo alto o alerta de pánico)
-- ============================================================
create table movil_asignado (
  id                uuid primary key default gen_random_uuid(),
  permiso_id        uuid references permiso(id),        -- escolta preventiva (riesgo alto)
  alerta_panico_id  uuid references alerta_panico(id),   -- respuesta a pánico
  identificador_movil text not null,
  asignado_por      uuid not null references usuario(id),
  asignado_at       timestamptz not null default now(),
  liberado_at       timestamptz,

  constraint movil_tiene_destino check (
    (permiso_id is not null) or (alerta_panico_id is not null)
  )
);

create index idx_movil_permiso on movil_asignado (permiso_id);
create index idx_movil_alerta on movil_asignado (alerta_panico_id);

-- ============================================================
-- 10. INFRACCION (permiso_id nullable → fiscaliza también sin permiso)
-- ============================================================
create table infraccion (
  id             uuid primary key default gen_random_uuid(),
  permiso_id     uuid references permiso(id),
  rut_infractor  text not null,
  inspector_id   uuid not null references usuario(id),
  comuna_id      uuid not null references comuna(id),
  ubicacion      geometry(Point, 4326) not null,
  descripcion    text not null,
  evidencia_url  text,
  fecha          timestamptz not null default now()
);

create index idx_infraccion_comuna on infraccion (comuna_id);
create index idx_infraccion_permiso on infraccion (permiso_id);

-- ============================================================
-- 11. HISTORIAL_EVENTOS (bitácora append-only)
-- ============================================================
create table historial_eventos (
  id            uuid primary key default gen_random_uuid(),
  permiso_id    uuid references permiso(id),
  comuna_id     uuid not null references comuna(id),   -- denormalizado, sección 10
  tipo_evento   text not null,
  accion        accion_operador,
  detalle       jsonb,
  actor_id      uuid references usuario(id),
  created_at    timestamptz not null default now()
);

create index idx_historial_permiso on historial_eventos (permiso_id, created_at);
create index idx_historial_comuna on historial_eventos (comuna_id, created_at);

-- Append-only: bloquear UPDATE y DELETE a nivel de tabla
create rule historial_no_update as on update to historial_eventos do instead nothing;
create rule historial_no_delete as on delete to historial_eventos do instead nothing;

-- ============================================================
-- TRIGGER: updated_at automático en permiso
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_permiso_updated_at
before update on permiso
for each row execute function set_updated_at();