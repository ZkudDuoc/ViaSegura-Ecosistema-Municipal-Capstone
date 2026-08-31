-- Ciclo de vida del permiso de circulación. El score/nivel de riesgo se completa en
-- Semana 2 al integrar con el microservicio de riesgo (servicio-riesgo).
CREATE TYPE permiso_estado AS ENUM (
  'PENDIENTE',
  'EN_EVALUACION',
  'APROBADO',
  'RECHAZADO',
  'EN_CURSO',
  'REVOCADO'
);

CREATE TABLE permiso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresa(id),
  usuario_id UUID NOT NULL REFERENCES usuario(id),
  comuna_id UUID NOT NULL REFERENCES comuna(id),
  tipo_actividad VARCHAR(100) NOT NULL,
  altura_estimada NUMERIC(6,2),
  poligono geometry(Polygon, 4326) NOT NULL,
  estado permiso_estado NOT NULL DEFAULT 'PENDIENTE',
  riesgo_score NUMERIC(5,2),
  riesgo_nivel VARCHAR(20),
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_permiso_fechas CHECK (fecha_fin > fecha_inicio)
);

CREATE INDEX idx_permiso_empresa_id ON permiso(empresa_id);
CREATE INDEX idx_permiso_usuario_id ON permiso(usuario_id);
CREATE INDEX idx_permiso_comuna_id ON permiso(comuna_id);
CREATE INDEX idx_permiso_estado ON permiso(estado);
CREATE INDEX idx_permiso_poligono ON permiso USING GIST (poligono);
