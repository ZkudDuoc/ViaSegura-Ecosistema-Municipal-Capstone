const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { opcionesCors } = require('./config/cors');
const authRoutes = require('./routes/authRoutes');
const permisoRoutes = require('./routes/permisoRoutes');
const comunaRoutes = require('./routes/comunaRoutes');
const empresaRoutes = require('./routes/empresaRoutes');
const empresaPanelRoutes = require('./routes/empresaPanelRoutes');
const trabajadorRoutes = require('./routes/trabajadorRoutes');
const panicoRoutes = require('./routes/panicoRoutes');
const vehiculoRoutes = require('./routes/vehiculoRoutes');
const codigoChoferRoutes = require('./routes/codigoChoferRoutes');
const infraccionRoutes = require('./routes/infraccionRoutes');
const reporteriaRoutes = require('./routes/reporteriaRoutes');
const riesgoRoutes = require('./routes/riesgoRoutes');

const app = express();

// Detrás del proxy de Render, `req.ip` sería la IP del proxy para todos los
// usuarios y el rate limiter bloquearía a todo el mundo a la vez. Con
// trust proxy = 1 se usa la IP real del cliente (último salto de
// X-Forwarded-For, que agrega el proxy y no se puede falsificar).
// TRUST_PROXY permite ajustarlo ("0" lo desactiva).
const trustProxy = process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? '1' : '0');
if (trustProxy !== '0') app.set('trust proxy', Number.isNaN(Number(trustProxy)) ? trustProxy : Number(trustProxy));

// CORP cross-origin: los frontends (otro origen) muestran imágenes y PDF del API.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(opcionesCors()));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/permisos', permisoRoutes);
app.use('/api/comunas', comunaRoutes);
app.use('/api/empresas', empresaRoutes);
app.use('/api/empresa', empresaPanelRoutes);
app.use('/api/trabajadores', trabajadorRoutes);
app.use('/api/panico', panicoRoutes);
app.use('/api/vehiculos', vehiculoRoutes);
app.use('/api/codigo-chofer', codigoChoferRoutes);
app.use('/api/infracciones', infraccionRoutes);
app.use('/api/reporteria', reporteriaRoutes);
app.use('/api/riesgo', riesgoRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado' });
});

// Errores de Postgres (https://www.postgresql.org/docs/current/errcodes-appendix.html)
// traducidos a respuestas HTTP con mensajes FIJOS: el `detail` de Postgres trae
// valores reales (emails, RUT, nombres de constraints) y no debe llegar al cliente.
const PG_ERRORES = {
  '22P02': [400, 'Algún dato tiene un formato inválido'], // ej. UUID mal formado
  '22007': [400, 'Fecha inválida'],
  '22008': [400, 'Fecha inválida'],
  '23502': [400, 'Falta un dato obligatorio'],
  '23503': [400, 'Se hace referencia a un registro que no existe'],
  '23505': [409, 'Ya existe un registro con esos datos'],
  '23514': [400, 'Los datos no cumplen las reglas de validación'],
  '23P01': [409, 'El área y el horario se solapan con otra solicitud'],
};

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Errores creados con errorHttp(): su mensaje es seguro para el cliente y
  // son esperables (validación, permisos): no se registran como fallas.
  if (err.publico) {
    return res.status(err.status ?? 400).json({ error: err.message });
  }

  console.error(err);

  if (PG_ERRORES[err.code]) {
    const [status, mensaje] = PG_ERRORES[err.code];
    return res.status(status).json({ error: mensaje });
  }

  // Errores del parser de Express (cuerpo demasiado grande, JSON inválido).
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La solicitud es demasiado grande' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la solicitud no es un JSON válido' });
  }

  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
