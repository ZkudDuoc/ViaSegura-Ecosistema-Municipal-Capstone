const axios = require('axios');

const RISK_SERVICE_URL = process.env.RISK_SERVICE_URL || 'http://localhost:8000';

const cliente = axios.create({ baseURL: RISK_SERVICE_URL, timeout: 5000 });

// poligono: GeoJSON Polygon en EPSG:4326 (mismo formato que envía la app móvil).
// fecha: 'YYYY-MM-DD'. hora_inicio: 0-23 (hora local de Chile; activa el peso nocturno).
// Devuelve { risk_score, congestion_score, nivel, n_incidentes_considerados, tipo_actividad,
//   comuna_detectada, fuente_congestion, explicacion, calles_afectadas? }.
async function evaluarRiesgo({ poligono, fecha, tipo_actividad, hora_inicio }) {
  const cuerpo = { poligono, fecha, tipo_actividad };
  if (Number.isInteger(hora_inicio)) cuerpo.hora_inicio = hora_inicio;
  const { data } = await cliente.post('/score', cuerpo);
  return data;
}

// Calles con su nivel de riesgo/congestión (GeoJSON si formato=geojson). Los
// parámetros se reenvían tal cual: comuna, metrica, hora, bbox, formato.
async function obtenerCallesRiesgo(params = {}) {
  const { data } = await cliente.get('/calles-riesgo', { params });
  return data;
}

async function obtenerZonasRojas() {
  const { data } = await cliente.get('/zonas-rojas');
  return data;
}

// obras: [{ id, poligono, fecha, tipo_actividad?, emergencia_activa? }]
async function obtenerRanking(obras) {
  const { data } = await cliente.post('/ranking-inspecciones', { obras });
  return data;
}

module.exports = { evaluarRiesgo, obtenerCallesRiesgo, obtenerZonasRojas, obtenerRanking };
