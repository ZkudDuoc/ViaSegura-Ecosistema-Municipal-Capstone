jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenMunicipal, tokenChofer } = require('../testUtils');

function mockDispatcher() {
  pool.query.mockImplementation((text) => {
    if (text.includes('count(*)::int AS total FROM permiso WHERE comuna_id')) return { rows: [{ total: 10 }] };
    if (text.includes('GROUP BY estado')) return { rows: [{ estado: 'ACTIVO', total: 5 }] };
    if (text.includes('GROUP BY er.nivel') || text.includes("er.nivel\n") ) return { rows: [{ nivel: 'ALTO', total: 2 }] };
    if (text.includes('minutos_promedio')) return { rows: [{ minutos_promedio: '12.3' }] };
    if (text.includes('revocadas')) return { rows: [{ revocadas: 1, rechazadas: 2, total: 10 }] };
    if (text.includes('minutos_respuesta_promedio')) return { rows: [{ total: 3, minutos_respuesta_promedio: '4.5' }] };
    if (text.includes('sla_confirmacion_min FROM comuna')) return { rows: [{ sla_confirmacion_min: 30 }] };
    if (text.includes('dentro_sla')) return { rows: [{ dentro_sla: 8, total: 10 }] };
    if (text.includes('dia_semana')) return { rows: [{ dia_semana: 1, hora: 9, total: 4 }] };
    if (text.includes('ranking') || text.includes('LEFT JOIN empresa')) return { rows: [{ empresa: 'ACME', total_solicitudes: 5, revocadas: 0, rechazadas: 1 }] };
    if (text.includes('FROM permiso p')) return { rows: [{ id: 'permiso-1', estado: 'ACTIVO' }] };
    return { rows: [] };
  });
}

describe('GET /api/reporteria/resumen', () => {
  beforeEach(() => pool.query.mockReset());

  test('403 si no es rol municipal', async () => {
    const res = await request(app).get('/api/reporteria/resumen').set('Authorization', `Bearer ${tokenChofer()}`);
    expect(res.status).toBe(403);
  });

  test('200 con las métricas del período', async () => {
    mockDispatcher();
    const res = await request(app).get('/api/reporteria/resumen').set('Authorization', `Bearer ${tokenMunicipal({ comuna_id: 'comuna-1' })}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        total_solicitudes: expect.any(Object),
        por_estado: expect.any(Object),
        porcentaje_revocadas: expect.any(Number),
        porcentaje_rechazadas: expect.any(Number),
        panico: expect.any(Object),
        sla: expect.any(Object),
      })
    );
  });
});

describe('GET /api/reporteria/historico', () => {
  beforeEach(() => pool.query.mockReset());

  test('200 en JSON por defecto', async () => {
    mockDispatcher();
    const res = await request(app).get('/api/reporteria/historico').set('Authorization', `Bearer ${tokenMunicipal({ comuna_id: 'comuna-1' })}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('exporta CSV cuando formato=csv', async () => {
    mockDispatcher();
    const res = await request(app)
      .get('/api/reporteria/historico?formato=csv')
      .set('Authorization', `Bearer ${tokenMunicipal({ comuna_id: 'comuna-1' })}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toMatch(/^id,rut_ejecutor/);
  });
});

describe('GET /api/reporteria/mapa-calor y ranking-empresas', () => {
  beforeEach(() => pool.query.mockReset());

  test('mapa-calor 200', async () => {
    mockDispatcher();
    const res = await request(app).get('/api/reporteria/mapa-calor').set('Authorization', `Bearer ${tokenMunicipal({ comuna_id: 'comuna-1' })}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('ranking-empresas 200', async () => {
    mockDispatcher();
    const res = await request(app).get('/api/reporteria/ranking-empresas').set('Authorization', `Bearer ${tokenMunicipal({ comuna_id: 'comuna-1' })}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
