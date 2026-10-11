-- ============================================================
-- VíaSegura — Semana 6: registro de empresa, nómina de trabajadores,
-- historial de la empresa, riesgo pendiente, comuna Santiago Centro.
-- Ejecutar DESPUÉS de 001..009. Idempotente. Va ANTES de 011 y 012.
-- ============================================================

-- ---------- 1. EMPRESA: datos de registro (nullable: no rompe las existentes) ----------
alter table empresa add column if not exists razon_social        text;
alter table empresa add column if not exists giro                text;
alter table empresa add column if not exists nombre_fantasia     text;
alter table empresa add column if not exists direccion           text;
alter table empresa add column if not exists comuna              text;
alter table empresa add column if not exists region              text;
alter table empresa add column if not exists email_contacto      text;
alter table empresa add column if not exists telefono            text;
alter table empresa add column if not exists representante_nombre text;
alter table empresa add column if not exists representante_rut    text;

-- ---------- 2. VEHICULO: baja lógica ----------
alter table vehiculo add column if not exists activo boolean not null default true;

-- ---------- 3. TRABAJADOR: nómina reutilizable de la empresa ----------
create table if not exists trabajador (
  id                       uuid primary key default gen_random_uuid(),
  empresa_id               uuid not null references empresa(id),
  rut                      text not null,
  nombre                   text not null,
  cargo                    text,
  contrato_vigente_hasta   date,
  epp_vigente_hasta        date,
  activo                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint trabajador_empresa_rut_unico unique (empresa_id, rut)
);

create index if not exists idx_trabajador_empresa_activo on trabajador (empresa_id, activo);

drop trigger if exists trg_trabajador_updated_at on trabajador;
create trigger trg_trabajador_updated_at
before update on trabajador
for each row execute function set_updated_at();

-- ---------- 4. PERSONAL_FAENA: foto del momento al crear la solicitud ----------
alter table personal_faena add column if not exists cargo                  text;
alter table personal_faena add column if not exists trabajador_id          uuid references trabajador(id);
alter table personal_faena add column if not exists contrato_vigente_hasta date;
alter table personal_faena add column if not exists epp_vigente_hasta      date;

-- ---------- 5. PERMISO: empresa dueña, riesgo pendiente, datos de revisión ----------
alter table permiso add column if not exists empresa_id                uuid references empresa(id);
alter table permiso add column if not exists riesgo_pendiente          boolean not null default false;
alter table permiso add column if not exists revision_motivo           text;
alter table permiso add column if not exists revision_ventana_inicio   timestamptz;
alter table permiso add column if not exists revision_ventana_fin      timestamptz;

-- Backfill: la empresa del permiso es la del usuario que lo creó.
update permiso p
set empresa_id = u.empresa_id
from usuario u
where u.id = p.usuario_id and p.empresa_id is null and u.empresa_id is not null;

-- Los permisos nuevos heredan la empresa del usuario sin tocar fn_crear_permiso.
create or replace function fn_permiso_set_empresa()
returns trigger as $$
begin
  if new.empresa_id is null then
    select empresa_id into new.empresa_id from usuario where id = new.usuario_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_permiso_set_empresa on permiso;
create trigger trg_permiso_set_empresa
before insert on permiso
for each row execute function fn_permiso_set_empresa();

-- ---------- 6. Índices ----------
create index if not exists idx_permiso_empresa_created on permiso (empresa_id, created_at desc);
create index if not exists idx_permiso_estado_ventana  on permiso (estado, ventana_fin);

-- ---------- 7. Comuna principal: Santiago Centro ----------
-- telefonos_alerta queda vacío a propósito (el pánico escala a cola local si
-- no hay SMS). Configurar con:
--   update comuna set telefonos_alerta = '{+56912345678}' where nombre = 'Santiago Centro';
insert into comuna (nombre, sla_confirmacion_min, sla_escolta_min, telefonos_alerta)
values ('Santiago Centro', 30, 60, '{}')
on conflict (nombre) do nothing;
