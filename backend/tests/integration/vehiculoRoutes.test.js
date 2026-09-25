jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenChofer, tokenMunicipal } = require('../testUtils');

describe('POST /api/vehiculos', () => {
  beforeEach(() => pool.query.mockReset());

  test('401 sin token', async () => {
    const res = await request(app).post('/api/vehiculos').send({ patente: 'ABCD12', alto_m: 4, ancho_m: 2.5, largo_m: 10, peso_ton: 15 });
    expect(res.status).toBe(401);
  });

  test('403 si el rol es municipal', async () => {
    const res = await request(app)
      .post('/api/vehiculos')
      .set('Authorization', `Bearer ${tokenMunicipal()}`)
      .send({ patente: 'ABCD12', alto_m: 4, ancho_m: 2.5, largo_m: 10, peso_ton: 15 });
    expect(res.status).toBe(403);
  });

  test('201 registra el vehículo', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'vehiculo-1', patente: 'ABCD12' }] });

    const res = await request(app)
      .post('/api/vehiculos')
      .set('Authorization', `Bearer ${tokenChofer()}`)
      .send({ patente: 'ABCD12', alto_m: 4, ancho_m: 2.5, largo_m: 10, peso_ton: 15 });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('vehiculo-1');
  });
});

describe('GET /api/vehiculos', () => {
  beforeEach(() => pool.query.mockReset());

  test('200 lista los vehículos del usuario autenticado', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'vehiculo-1', patente: 'ABCD12' }] });

    const res = await request(app).get('/api/vehiculos').set('Authorization', `Bearer ${tokenChofer()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'vehiculo-1', patente: 'ABCD12' }]);
  });
});
