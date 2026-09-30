jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenMunicipal, tokenChofer } = require('../testUtils');

describe('GET /api/permisos/:id', () => {
  beforeEach(() => pool.query.mockReset());

  test('401 sin token', async () => {
    const res = await request(app).get('/api/permisos/permiso-1');
    expect(res.status).toBe(401);
  });

  test('404 si no existe', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/permisos/permiso-1').set('Authorization', `Bearer ${tokenChofer()}`);
    expect(res.status).toBe(404);
  });

  test('200 con detalle completo para el dueño', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'permiso-1', usuario_id: 'chofer-1', comuna_id: 'comuna-1', foto_evidencia_url: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }); // bitacoraService no mockeado: usa pool.query real -> historial_eventos

    const res = await request(app).get('/api/permisos/permiso-1').set('Authorization', `Bearer ${tokenChofer({ id: 'chofer-1' })}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('permiso-1');
    expect(res.body.personal).toEqual([]);
  });
});

describe('PATCH /api/permisos/:id/rechazar', () => {
  beforeEach(() => pool.query.mockReset());

  test('403 si el rol no es municipal', async () => {
    const res = await request(app)
      .patch('/api/permisos/permiso-1/rechazar')
      .set('Authorization', `Bearer ${tokenChofer()}`)
      .send({ motivo: 'x' });
    expect(res.status).toBe(403);
  });

  test('200 rechaza la solicitud', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'permiso-1', estado: 'RECHAZADO', comuna_id: 'comuna-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ev-1' }] });

    const res = await request(app)
      .patch('/api/permisos/permiso-1/rechazar')
      .set('Authorization', `Bearer ${tokenMunicipal()}`)
      .send({ motivo: 'faltan datos' });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('RECHAZADO');
  });
});

describe('PATCH /api/permisos/:id/finalizar', () => {
  beforeEach(() => pool.query.mockReset());

  test('403 si el rol es municipal', async () => {
    const res = await request(app)
      .patch('/api/permisos/permiso-1/finalizar')
      .set('Authorization', `Bearer ${tokenMunicipal()}`);
    expect(res.status).toBe(403);
  });

  test('200 finaliza el servicio del chofer', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'permiso-1', estado: 'FINALIZADO', comuna_id: 'comuna-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ev-1' }] });

    const res = await request(app)
      .patch('/api/permisos/permiso-1/finalizar')
      .set('Authorization', `Bearer ${tokenChofer()}`);

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('FINALIZADO');
  });
});
