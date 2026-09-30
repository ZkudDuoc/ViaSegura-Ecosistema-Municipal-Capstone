jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenMunicipal, tokenChofer } = require('../testUtils');

describe('POST /api/infracciones', () => {
  beforeEach(() => pool.query.mockReset());

  test('403 si no es rol municipal', async () => {
    const res = await request(app)
      .post('/api/infracciones')
      .set('Authorization', `Bearer ${tokenChofer()}`)
      .send({ rut_infractor: '11111111-1', descripcion: 'x', ubicacion: { lat: 1, lng: 1 } });
    expect(res.status).toBe(403);
  });

  test('400 si faltan campos obligatorios', async () => {
    const res = await request(app)
      .post('/api/infracciones')
      .set('Authorization', `Bearer ${tokenMunicipal()}`)
      .send({ rut_infractor: '11111111-1' });
    expect(res.status).toBe(400);
  });

  test('201 crea la infracción sin permiso asociado (camión sin permiso)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'inf-1', permiso_id: null, rut_infractor: '11111111-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ev-1' }] });

    const res = await request(app)
      .post('/api/infracciones')
      .set('Authorization', `Bearer ${tokenMunicipal({ comuna_id: 'comuna-1' })}`)
      .send({ rut_infractor: '11111111-1', descripcion: 'Circulación sin permiso', ubicacion: { lat: -33.4, lng: -70.6 } });

    expect(res.status).toBe(201);
    expect(res.body.permiso_id).toBeNull();
  });

  test('201 crea la infracción asociada a un permiso existente', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ comuna_id: 'comuna-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'inf-2', permiso_id: 'permiso-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ev-1' }] });

    const res = await request(app)
      .post('/api/infracciones')
      .set('Authorization', `Bearer ${tokenMunicipal({ comuna_id: 'comuna-1' })}`)
      .send({ permiso_id: 'permiso-1', rut_infractor: '11111111-1', descripcion: 'Patente no coincide', ubicacion: { lat: -33.4, lng: -70.6 } });

    expect(res.status).toBe(201);
    expect(res.body.permiso_id).toBe('permiso-1');
  });
});

describe('GET /api/infracciones', () => {
  beforeEach(() => pool.query.mockReset());

  test('200 lista las infracciones de la comuna, sin exigir permiso_id', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'inf-1' }] });
    const res = await request(app).get('/api/infracciones').set('Authorization', `Bearer ${tokenMunicipal({ comuna_id: 'comuna-1' })}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'inf-1' }]);
  });
});
