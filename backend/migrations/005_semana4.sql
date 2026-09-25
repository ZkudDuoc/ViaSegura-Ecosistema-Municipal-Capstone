-- ============================================================
-- VíaSegura — Semana 4: VEHICULO + validación patente-vs-permiso,
-- modelo dual Empresa/Persona natural, estado "en operativo".
-- Ejecutar DESPUÉS de 001..004.
-- ============================================================

-- ---------- 1. Modelo dual EMPRESA / PERSONA NATURAL en USUARIO ----------
create type persona_tipo as enum ('EMPRESA', 'NATURAL');

alter table usuario add column if not exists tipo_persona persona_tipo not null default 'EMPRESA';

-- CHOFER/LOGISTICA de una empresa registrada: empresa_id obligatorio.
-- CHOFER/LOGISTICA persona natural (sin empresa registrada): empresa_id nulo.
-- Roles municipales: sin cambios, siguen requiriendo comuna_id y sin empresa_id.
alter table usuario drop constraint if exists usuario_rol_scope;

alter table usuario add constraint usuario_rol_scope check (
  (rol in ('CHOFER','LOGISTICA')
    and comuna_id is null
    and (
      (tipo_persona = 'EMPRESA' and empresa_id is not null)
      or
      (tipo_persona = 'NATURAL' and empresa_id is null)
    ))
  or
  (rol in ('OPERADOR_MUNICIPAL','INSPECTOR_MUNICIPAL')
    and comuna_id is not null and empresa_id is null and tipo_persona = 'EMPRESA')
);

-- ---------- 2. VEHICULO (patente + medidas), ligado a EMPRESA o a una ----------
-- persona natural (usuario CHOFER/LOGISTICA sin empresa).
create table if not exists vehiculo (
  id          uuid primary key default gen_random_uuid(),
  patente     text not null unique,
  alto_m      numeric not null,
  ancho_m     numeric not null,
  largo_m     numeric not null,
  peso_ton    numeric not null,
  empresa_id  uuid references empresa(id),
  usuario_id  uuid references usuario(id),
  created_at  timestamptz not null default now(),

  constraint vehiculo_dueno_unico check (
    (empresa_id is not null and usuario_id is null)
    or
    (empresa_id is null and usuario_id is not null)
  )
);

create index if not exists idx_vehiculo_empresa on vehiculo (empresa_id);
create index if not exists idx_vehiculo_usuario on vehiculo (usuario_id);

-- ---------- 3. PERMISO ligado a un VEHICULO (para validar patente en terreno) ----------
alter table permiso add column if not exists vehiculo_id uuid references vehiculo(id);
