const axios = require('axios');

const RISK_SERVICE_URL = process.env.RISK_SERVICE_URL || 'http://localhost:8000';

const cliente = axios.create({ baseURL: RISK_SERVICE_URL, timeout: 5000 });

// poligono: GeoJSON Polygon en EPSG:4326 (mismo formato que envía la app móvil).
// fecha: 'YYYY-MM-DD'. Devuelve { risk_score, congestion_score, nivel, n_incidentes_considerados, tipo_actividad }.
async function evaluarRiesgo({ poligono, fecha, tipo_actividad }) {
  const { data } = await cliente.post('/score', { poligono, fecha, tipo_actividad });
  return data;
}

module.exports = { evaluarRiesgo };
