const riskService = require('../services/riskService');

const TTL_MS = Number(process.env.RIESGO_CACHE_TTL_MS) || 5 * 60 * 1000;
const MAX_ENTRADAS = 100;

const cache = new Map();

function leerCache(clave) {
  const entrada = cache.get(clave);
  if (!entrada) return null;
  if (Date.now() - entrada.guardadoEn > TTL_MS) {
    cache.delete(clave);
    return null;
  }
  return entrada.datos;
}

function guardarCache(clave, datos) {
  if (cache.size >= MAX_ENTRADAS) cache.delete(cache.keys().next().value);
  cache.set(clave, { datos, guardadoEn: Date.now() });
}

function limpiarCache() {
  cache.clear();
}

// Los frontends NO llaman al microservicio de Python: pasan por acá (auth,
// roles y caché). Misma respuesta que entrega el servicio de riesgo.
async function conCache(clave, obtener, res) {
  const guardado = leerCache(clave);
  if (guardado) {
    res.set('X-Cache', 'HIT');
    return res.json(guardado);
  }

  let datos;
  try {
    datos = await obtener();
  } catch (err) {
    console.error('Servicio de riesgo no disponible:', err.code || err.message);
    return res.status(503).json({ error: 'El servicio de riesgo no está disponible. Intenta de nuevo en unos minutos.' });
  }

  guardarCache(clave, datos);
  res.set('X-Cache', 'MISS');
  res.json(datos);
}

// GET /api/riesgo/calles?comuna=&metrica=riesgo|congestion&hora=&bbox=&formato=geojson
// Por defecto comuna=SANTIAGO y formato=geojson.
async function calles(req, res) {
  const params = { comuna: 'SANTIAGO', formato: 'geojson' };
  for (const [clave, valor] of Object.entries(req.query)) {
    if (typeof valor === 'string' && valor.trim() !== '') params[clave] = valor.trim();
  }

  const clave = `calles:${JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)))}`;
  return conCache(clave, () => riskService.obtenerCallesRiesgo(params), res);
}

// GET /api/riesgo/zonas-rojas
async function zonasRojas(req, res) {
  return conCache('zonas-rojas', () => riskService.obtenerZonasRojas(), res);
}

module.exports = { calles, zonasRojas, limpiarCache };
