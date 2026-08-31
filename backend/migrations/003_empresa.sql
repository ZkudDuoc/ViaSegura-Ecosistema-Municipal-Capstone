CREATE TABLE empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rut VARCHAR(12) NOT NULL UNIQUE,
  razon_social VARCHAR(200) NOT NULL,
  comuna_id UUID NOT NULL REFERENCES comuna(id),
  direccion VARCHAR(250),
  telefono VARCHAR(30),
  email VARCHAR(150),
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_empresa_comuna_id ON empresa(comuna_id);
