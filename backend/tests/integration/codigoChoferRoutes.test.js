jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenChofer, tokenMunicipal } = require('../testUtils');

describe('POST /api/permisos/:id/codigo-chofer', () => {
  beforeEach(() => pool.query.mockReset());

  test('404 si el permiso no es del usuario', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post('/api/permisos/permiso-1/codigo-chofer')
      .set('Authorization', `Bearer ${tokenChofer()}`);
    expect(res.status).toBe(404);
  });

  test('201 genera el código', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'permiso-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'cc-1', codigo: 'a'.repeat(32), expira_at: '2026-01-02' }] });

    const res = await request(app)
      .post('/api/permisos/permiso-1/codigo-chofer')
      .set('Authorization', `Bearer ${tokenChofer()}`);

    expect(res.status).toBe(201);
    expect(res.body.codigo).toHaveLength(32);
  });
});

describe('POST /api/codigo-chofer/canjear', () => {
  beforeEach(() => pool.query.mockReset());

  test('401 con código inválido', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).post('/api/codigo-chofer/canjear').send({ codigo: 'x' });
    expect(res.status).toBe(401);
  });

  test('200 y devuelve un token de sesión limitada, sin requerir JWT', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'cc-1', permiso_id: 'permiso-1' }] });

    const res = await request(app).post('/api/codigo-chofer/canjear').send({ codigo: 'a'.repeat(32) });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.permiso_id).toBe('permiso-1');
  });

});

describe('sesión de código de chofer sobre GET/PATCH de permiso', () => {
  beforeEach(() => pool.query.mockReset());

  test('el token de código de chofer puede ver el detalle de SU permiso', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'cc-1', permiso_id: 'permiso-1' }] });
    const canje = await request(app).post('/api/codigo-chofer/canjear').send({ codigo: 'b'.repeat(32) });
    const token = canje.body.token;

    pool.query.mockReset();
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'permiso-1', usuario_id: 'otro-chofer', comuna_id: 'comuna-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/permisos/permiso-1').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('el token de código de chofer NO puede ver otro permiso distinto', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'cc-1', permiso_id: 'permiso-1' }] });
    const canje = await request(app).post('/api/codigo-chofer/canjear').send({ codigo: 'c'.repeat(32) });
    const token = canje.body.token;

    const res = await request(app).get('/api/permisos/otro-permiso').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
