CREATE TABLE usuario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresa(id),
  rol_id UUID NOT NULL REFERENCES rol(id),
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usuario_empresa_id ON usuario(empresa_id);
CREATE INDEX idx_usuario_rol_id ON usuario(rol_id);

COMMENT ON COLUMN usuario.empresa_id IS 'NULL para roles internos sin empresa asociada (inspector, operador, supervisor)';
