-- ============================================================
-- VíaSegura — Semana 5, Bloque 2: código de chofer de un solo uso (canje
-- público sin cuenta) y soporte para QR firmado del permiso.
-- Ejecutar DESPUÉS de 006 y 007.
-- ============================================================

create table if not exists codigo_chofer (
  id                uuid primary key default gen_random_uuid(),
  permiso_id        uuid not null references permiso(id) on delete cascade,
  codigo            text not null unique,
  usado             boolean not null default false,
  usado_at          timestamptz,
  expira_at         timestamptz not null,
  creado_por        uuid not null references usuario(id),
  created_at        timestamptz not null default now()
);

create index if not exists idx_codigochofer_codigo on codigo_chofer (codigo);
create index if not exists idx_codigochofer_permiso on codigo_chofer (permiso_id);
