-- Autenticación propia del backend (Node + Express + JWT), sin depender de Supabase Auth.
-- Ejecutar en SQL Editor de Supabase después de 001_schema.sql y 002_logica.sql.

alter table usuario add column if not exists password_hash text;

-- password_hash es NOT NULL a nivel de aplicación (se exige en el registro),
-- se deja nullable en la BD para no romper filas ya creadas manualmente durante las pruebas.