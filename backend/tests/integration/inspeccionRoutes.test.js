jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenMunicipal, tokenChofer } = require('../testUtils');

describe('POST /api/permisos/:id/inspeccion', () => {
  beforeEach(() => pool.query.mockReset());

  test('403 si no es rol municipal', async () => {
    const res = await request(app)
      .post('/api/permisos/permiso-1/inspeccion')
      .set('Authorization', `Bearer ${tokenChofer()}`)
      .send({ resultado: 'CONFORME' });
    expect(res.status).toBe(403);
  });

  test('400 si resultado no es válido', async () => {
    const res = await request(app)
      .post('/api/permisos/permiso-1/inspeccion')
      .set('Authorization', `Bearer ${tokenMunicipal()}`)
      .send({ resultado: 'ALGO_RARO' });
    expect(res.status).toBe(400);
  });

  test('404 si el permiso no es de la comuna del inspector', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post('/api/permisos/permiso-1/inspeccion')
      .set('Authorization', `Bearer ${tokenMunicipal()}`)
      .send({ resultado: 'CONFORME' });
    expect(res.status).toBe(404);
  });

  test('CONFORME: aprueba la faena sin cambiar el estado del permiso', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'permiso-1', comuna_id: 'comuna-1', usuario_id: 'chofer-1', estado: 'ACTIVO' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'insp-1', permiso_id: 'permiso-1', resultado: 'CONFORME', created_at: '2026-01-01' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ev-1' }] });

    const res = await request(app)
      .post('/api/permisos/permiso-1/inspeccion')
      .set('Authorization', `Bearer ${tokenMunicipal({ comuna_id: 'comuna-1' })}`)
      .send({ senaletica_ok: true, epp_ok: true, operarios_coinciden: true, patente_coincide: true, resultado: 'CONFORME' });

    expect(res.status).toBe(201);
    expect(res.body.estado_permiso).toBe('ACTIVO');
  });

  test('SUSPENDIDA: detiene la obra de inmediato', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'permiso-1', comuna_id: 'comuna-1', usuario_id: 'chofer-1', estado: 'ACTIVO' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'insp-2', permiso_id: 'permiso-1', resultado: 'SUSPENDIDA', created_at: '2026-01-01' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ev-2' }] })
      .mockResolvedValueOnce({ rows: [{ estado: 'SUSPENDIDO' }] });

    const res = await request(app)
      .post('/api/permisos/permiso-1/inspeccion')
      .set('Authorization', `Bearer ${tokenMunicipal({ comuna_id: 'comuna-1' })}`)
      .send({ resultado: 'SUSPENDIDA', observaciones: 'Sin señalética' });

    expect(res.status).toBe(201);
    expect(res.body.estado_permiso).toBe('SUSPENDIDO');
  });
});

describe('GET /api/permisos/:id/inspeccion', () => {
  beforeEach(() => pool.query.mockReset());

  test('200 lista el historial de checklists', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'permiso-1', comuna_id: 'comuna-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'insp-1', resultado: 'CONFORME' }] });

    const res = await request(app)
      .get('/api/permisos/permiso-1/inspeccion')
      .set('Authorization', `Bearer ${tokenMunicipal({ comuna_id: 'comuna-1' })}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'insp-1', resultado: 'CONFORME' }]);
  });
});
