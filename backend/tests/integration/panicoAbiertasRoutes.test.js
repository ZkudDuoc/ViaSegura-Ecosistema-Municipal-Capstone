jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenMunicipal, tokenChofer } = require('../testUtils');

describe('GET /api/panico/abiertas', () => {
  beforeEach(() => pool.query.mockReset());

  test('403 si no es rol municipal', async () => {
    const res = await request(app).get('/api/panico/abiertas').set('Authorization', `Bearer ${tokenChofer()}`);
    expect(res.status).toBe(403);
  });

  test('200 lista las alertas activas de la comuna (cualquier origen)', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'alerta-1', origen: 'SMS', estado: 'ACTIVA' }] });

    const res = await request(app).get('/api/panico/abiertas').set('Authorization', `Bearer ${tokenMunicipal({ comuna_id: 'comuna-1' })}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'alerta-1', origen: 'SMS', estado: 'ACTIVA' }]);
    expect(pool.query.mock.calls[0][1]).toEqual(['comuna-1']);
  });
});

describe('PATCH /api/panico/:id/atender', () => {
  beforeEach(() => pool.query.mockReset());

  test('409 si la alerta no existe o ya fue atendida', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).patch('/api/panico/alerta-1/atender').set('Authorization', `Bearer ${tokenMunicipal()}`);
    expect(res.status).toBe(409);
  });

  test('200 marca la alerta como atendida, quién y cuándo', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'alerta-1', permiso_id: 'permiso-1', atendido_at: '2026-01-01' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ev-1' }] });

    const res = await request(app)
      .patch('/api/panico/alerta-1/atender')
      .set('Authorization', `Bearer ${tokenMunicipal({ id: 'op-1' })}`);

    expect(res.status).toBe(200);
    expect(res.body.atendido_at).toBe('2026-01-01');
  });
});
