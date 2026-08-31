CREATE TABLE comuna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(120) NOT NULL,
  region VARCHAR(120) NOT NULL,
  codigo_ine VARCHAR(10) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
