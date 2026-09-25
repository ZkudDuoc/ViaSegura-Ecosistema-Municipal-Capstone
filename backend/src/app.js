const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const permisoRoutes = require('./routes/permisoRoutes');
const comunaRoutes = require('./routes/comunaRoutes');
const empresaRoutes = require('./routes/empresaRoutes');
const panicoRoutes = require('./routes/panicoRoutes');
const vehiculoRoutes = require('./routes/vehiculoRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/permisos', permisoRoutes);
app.use('/api/comunas', comunaRoutes);
app.use('/api/empresas', empresaRoutes);
app.use('/api/panico', panicoRoutes);
app.use('/api/vehiculos', vehiculoRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado' });
});

// Códigos de error de Postgres (https://www.postgresql.org/docs/current/errcodes-appendix.html)
// traducidos a respuestas HTTP, para no filtrar el stack/HTML default de Express.
const PG_ERROR_STATUS = {
  '22P02': 400, // invalid_text_representation (ej. UUID mal formado)
  '23502': 400, // not_null_violation
  '23503': 400, // foreign_key_violation
  '23505': 409, // unique_violation
  '23514': 400, // check_violation (ej. usuario_rol_scope, permiso_ventana_valida)
};

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);

  const status = PG_ERROR_STATUS[err.code] || err.status || 500;
  const mensaje =
    status === 500 ? 'Error interno del servidor' : err.detail || err.message || 'Solicitud inválida';

  res.status(status).json({ error: mensaje });
});

module.exports = app;
