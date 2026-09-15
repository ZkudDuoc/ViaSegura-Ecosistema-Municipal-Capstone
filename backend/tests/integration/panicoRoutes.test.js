jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenMunicipal, tokenChofer } = require('../testUtils');

describe('GET /api/panico/cola-local', () => {
  beforeEach(() => pool.query.mockReset());

  test('403 si no es rol municipal', async () => {
    const res = await request(app)
      .get('/api/panico/cola-local')
      .set('Authorization', `Bearer ${tokenChofer()}`);
    expect(res.status).toBe(403);
  });

  test('200 devuelve las alertas pendientes de la comuna', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'cola-1', comuna_id: 'comuna-1', procesado: false }] });

    const res = await request(app)
      .get('/api/panico/cola-local')
      .set('Authorization', `Bearer ${tokenMunicipal({ comuna_id: 'comuna-1' })}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'cola-1', comuna_id: 'comuna-1', procesado: false }]);
  });
});

describe('PATCH /api/panico/cola-local/:id/procesar', () => {
  beforeEach(() => pool.query.mockReset());

  test('409 si ya fue procesada o no existe', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .patch('/api/panico/cola-local/cola-1/procesar')
      .set('Authorization', `Bearer ${tokenMunicipal()}`);

    expect(res.status).toBe(409);
  });

  test('200 marca como procesada, actualiza la alerta y registra bitácora', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'cola-1', alerta_panico_id: 'alerta-1', procesado_at: '2026-01-01' }] })
      .mockResolvedValueOnce({ rows: [] }) // update alerta_panico
      .mockResolvedValueOnce({ rows: [{ id: 'ev-1' }] }); // bitacora

    const res = await request(app)
      .patch('/api/panico/cola-local/cola-1/procesar')
      .set('Authorization', `Bearer ${tokenMunicipal({ id: 'op-1' })}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('cola-1');
  });
});
