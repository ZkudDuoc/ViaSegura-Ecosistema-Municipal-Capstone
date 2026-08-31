-- Roles del sistema (ver plan sección 2): Chofer/Logística, Inspector, Operador Central, Supervisor.
CREATE TABLE rol (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion VARCHAR(200)
);

INSERT INTO rol (nombre, descripcion) VALUES
  ('CHOFER_LOGISTICA', 'Crea solicitudes de permiso y activa el botón de pánico'),
  ('INSPECTOR', 'Escanea QR y registra infracciones en terreno'),
  ('OPERADOR_CENTRAL', 'Evalúa y decide sobre las solicitudes de permiso'),
  ('SUPERVISOR', 'Acceso de solo lectura a reportería');
