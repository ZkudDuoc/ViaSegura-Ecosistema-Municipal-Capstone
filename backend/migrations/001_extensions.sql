-- Habilita PostGIS para columnas geoespaciales (polígono de la solicitud de permiso)
-- y pgcrypto para generar UUIDs con gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
