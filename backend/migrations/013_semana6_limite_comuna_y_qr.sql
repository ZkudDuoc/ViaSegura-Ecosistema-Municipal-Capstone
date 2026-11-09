-- ============================================================
-- VíaSegura — Semana 6 (feedback del profesor, parte 2):
--   1) cada comuna limita DÓNDE se puede reservar (contorno + habilitada)
--   2) secreto por permiso para el QR dinámico sin conexión (TOTP, RFC 6238)
-- Ejecutar DESPUÉS de 010..012 y ANTES de 014 (que carga el contorno de
-- Santiago Centro) y de desplegar el backend que valida contra estas columnas.
-- Idempotente.
-- ============================================================

-- ---------- 1. Contorno y habilitación de la comuna ----------
alter table comuna add column if not exists limite geometry(MultiPolygon, 4326);
alter table comuna add column if not exists habilitada boolean not null default false;

-- Una comuna solo puede estar habilitada si tiene contorno cargado.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comuna_habilitada_con_limite') then
    alter table comuna
      add constraint comuna_habilitada_con_limite check (not habilitada or limite is not null);
  end if;
end $$;

create index if not exists idx_comuna_limite on comuna using gist (limite);

-- Comunas que aparecen en la lista pero todavía no se pueden usar
-- (habilitada = false y sin contorno): se habilitan al cargar su límite.
insert into comuna (nombre, sla_confirmacion_min, sla_escolta_min, telefonos_alerta)
values
  ('Providencia', 30, 60, '{}'),
  ('San Joaquín', 30, 60, '{}')
on conflict (nombre) do nothing;

-- ---------- 2. Secreto del QR dinámico (TOTP) ----------
-- Tabla aparte: GET /permisos/:id hace SELECT p.* y el secreto se filtraría
-- si viviera en `permiso`.
create table if not exists permiso_qr_secreto (
  permiso_id  uuid primary key references permiso(id) on delete cascade,
  secreto     text not null,
  created_at  timestamptz not null default now()
);
