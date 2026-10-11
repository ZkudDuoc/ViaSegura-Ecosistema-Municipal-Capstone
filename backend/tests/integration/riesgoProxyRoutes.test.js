jest.mock('../../src/config/db', () => ({ query: jest.fn() }));
jest.mock('../../src/services/riskService', () => ({
  evaluarRiesgo: jest.fn(),
  obtenerCallesRiesgo: jest.fn(),
  obtenerZonasRojas: jest.fn(),
  obtenerRanking: jest.fn(),
}));

const request = require('supertest');
const riskService = require('../../src/services/riskService');
const app = require('../../src/app');
const { limpiarCache } = require('../../src/controllers/riesgoController');
const { tokenChofer, tokenMunicipal } = require('../testUtils');

const operador = { Authorization: `Bearer ${tokenMunicipal()}` };

const GEOJSON = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { calle_id: 'c1', nombre: 'Alameda', risk_score: 70 }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }],
  metadata: { total: 1, comuna: 'SANTIAGO' },
};

beforeEach(() => {
  limpiarCache();
  Object.values(riskService).forEach((fn) => fn.mockReset());
});

describe('GET /api/riesgo/calles (proxy al servicio de riesgo)', () => {
  test('401 sin token y 403 para cuentas de empresa', async () => {
    expect((await request(app).get('/api/riesgo/calles')).status).toBe(401);
    const res = await request(app).get('/api/riesgo/calles').set({ Authorization: `Bearer ${tokenChofer()}` });
    expect(res.status).toBe(403);
    expect(riskService.obtenerCallesRiesgo).not.toHaveBeenCalled();
  });

  test('por defecto pide comuna=SANTIAGO en formato geojson y reenvía la respuesta tal cual', async () => {
    riskService.obtenerCallesRiesgo.mockResolvedValue(GEOJSON);

    const res = await request(app).get('/api/riesgo/calles').set(operador);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(GEOJSON);
    expect(riskService.obtenerCallesRiesgo).toHaveBeenCalledWith({ comuna: 'SANTIAGO', formato: 'geojson' });
  });

  test('reenvía los parámetros recibidos (metrica, hora, bbox) y deja que el cliente cambie los defectos', async () => {
    riskService.obtenerCallesRiesgo.mockResolvedValue(GEOJSON);

    await request(app).get('/api/riesgo/calles?comuna=PROVIDENCIA&metrica=congestion&hora=18&bbox=-70.7,-33.5,-70.6,-33.4&formato=json').set(operador);

    expect(riskService.obtenerCallesRiesgo).toHaveBeenCalledWith({
      comuna: 'PROVIDENCIA',
      formato: 'json',
      metrica: 'congestion',
      hora: '18',
      bbox: '-70.7,-33.5,-70.6,-33.4',
    });
  });

  test('cachea por combinación de parámetros: la segunda llamada no vuelve al servicio de riesgo', async () => {
    riskService.obtenerCallesRiesgo.mockResolvedValue(GEOJSON);

    const primera = await request(app).get('/api/riesgo/calles?metrica=riesgo').set(operador);
    const segunda = await request(app).get('/api/riesgo/calles?metrica=riesgo').set(operador);
    const otra = await request(app).get('/api/riesgo/calles?metrica=congestion').set(operador);

    expect(primera.headers['x-cache']).toBe('MISS');
    expect(segunda.headers['x-cache']).toBe('HIT');
    expect(segunda.body).toEqual(GEOJSON);
    expect(otra.headers['x-cache']).toBe('MISS');
    expect(riskService.obtenerCallesRiesgo).toHaveBeenCalledTimes(2);
  });

  test('el orden de los parámetros no genera entradas de caché distintas', async () => {
    riskService.obtenerCallesRiesgo.mockResolvedValue(GEOJSON);
    await request(app).get('/api/riesgo/calles?metrica=riesgo&hora=9').set(operador);
    const res = await request(app).get('/api/riesgo/calles?hora=9&metrica=riesgo').set(operador);
    expect(res.headers['x-cache']).toBe('HIT');
  });

  test('la caché expira pasado el TTL', async () => {
    riskService.obtenerCallesRiesgo.mockResolvedValue(GEOJSON);
    const ahora = Date.now();
    const spy = jest.spyOn(Date, 'now');

    spy.mockReturnValue(ahora);
    await request(app).get('/api/riesgo/calles').set(operador);

    spy.mockReturnValue(ahora + 11 * 60 * 1000);
    const res = await request(app).get('/api/riesgo/calles').set(operador);
    spy.mockRestore();

    expect(res.headers['x-cache']).toBe('MISS');
    expect(riskService.obtenerCallesRiesgo).toHaveBeenCalledTimes(2);
  });

  test('503 claro si el servicio de riesgo no responde, y no cachea el error', async () => {
    riskService.obtenerCallesRiesgo.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const caido = await request(app).get('/api/riesgo/calles').set(operador);
    expect(caido.status).toBe(503);
    expect(caido.body.error).toMatch(/servicio de riesgo no está disponible/i);

    riskService.obtenerCallesRiesgo.mockResolvedValueOnce(GEOJSON);
    const recuperado = await request(app).get('/api/riesgo/calles').set(operador);
    expect(recuperado.status).toBe(200);
  });
});

describe('GET /api/riesgo/zonas-rojas', () => {
  test('proxy con caché y 503 si el servicio está caído', async () => {
    riskService.obtenerZonasRojas.mockResolvedValue({ total_clusters: 2, zonas: [] });

    const a = await request(app).get('/api/riesgo/zonas-rojas').set(operador);
    const b = await request(app).get('/api/riesgo/zonas-rojas').set(operador);
    expect(a.status).toBe(200);
    expect(b.headers['x-cache']).toBe('HIT');
    expect(riskService.obtenerZonasRojas).toHaveBeenCalledTimes(1);

    limpiarCache();
    riskService.obtenerZonasRojas.mockRejectedValue(new Error('timeout'));
    expect((await request(app).get('/api/riesgo/zonas-rojas').set(operador)).status).toBe(503);
  });

  test('solo roles municipales', async () => {
    const res = await request(app).get('/api/riesgo/zonas-rojas').set({ Authorization: `Bearer ${tokenChofer()}` });
    expect(res.status).toBe(403);
  });
});
