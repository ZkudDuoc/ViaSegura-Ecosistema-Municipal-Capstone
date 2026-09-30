jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenChofer, tokenMunicipal } = require('../testUtils');

describe('GET /api/permisos/:id/qr-token', () => {
  beforeEach(() => pool.query.mockReset());

  test('403 si el permiso no es del chofer', async () => {
    pool.query.mockResolvedValue({ rows: [{ usuario_id: 'otro', ventana_fin: '2026-01-01T00:00:00Z' }] });
    const res = await request(app)
      .get('/api/permisos/permiso-1/qr-token')
      .set('Authorization', `Bearer ${tokenChofer({ id: 'chofer-1' })}`);
    expect(res.status).toBe(403);
  });

  test('200 devuelve un token firmado, distinto del id crudo', async () => {
    const ventanaFin = new Date(Date.now() + 3600000).toISOString();
    pool.query.mockResolvedValue({ rows: [{ usuario_id: 'chofer-1', ventana_fin: ventanaFin }] });

    const res = await request(app)
      .get('/api/permisos/permiso-1/qr-token')
      .set('Authorization', `Bearer ${tokenChofer({ id: 'chofer-1' })}`);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.token).not.toBe('permiso-1');
  });
});

describe('GET /api/permisos/qr/:token (verificación del Supervisor)', () => {
  beforeEach(() => pool.query.mockReset());

  test('400 si el token no es válido', async () => {
    const res = await request(app)
      .get('/api/permisos/qr/token-basura')
      .set('Authorization', `Bearer ${tokenMunicipal()}`);
    expect(res.status).toBe(400);
  });

  test('200 verifica el token y devuelve el detalle del permiso', async () => {
    const ventanaFin = new Date(Date.now() + 3600000).toISOString();
    pool.query.mockResolvedValue({ rows: [{ usuario_id: 'chofer-1', ventana_fin: ventanaFin }] });

    const generado = await request(app)
      .get('/api/permisos/permiso-1/qr-token')
      .set('Authorization', `Bearer ${tokenChofer({ id: 'chofer-1' })}`);
    const token = generado.body.token;

    pool.query.mockReset();
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'permiso-1', usuario_id: 'chofer-1', comuna_id: 'comuna-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get(`/api/permisos/qr/${token}`)
      .set('Authorization', `Bearer ${tokenMunicipal({ comuna_id: 'comuna-1' })}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('permiso-1');
  });
});
