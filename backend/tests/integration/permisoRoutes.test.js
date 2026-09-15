jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenMunicipal, tokenChofer } = require('../testUtils');

describe('GET /api/permisos/cola', () => {
  beforeEach(() => pool.query.mockReset());

  test('401 sin token', async () => {
    const res = await request(app).get('/api/permisos/cola');
    expect(res.status).toBe(401);
  });

  test('403 si el rol no es municipal', async () => {
    const res = await request(app)
      .get('/api/permisos/cola')
      .set('Authorization', `Bearer ${tokenChofer()}`);
    expect(res.status).toBe(403);
  });

  test('200 y devuelve la cola de la comuna del operador', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'permiso-1', motivo_cola: 'CONFLICTO_RESERVA' }] });

    const res = await request(app)
      .get('/api/permisos/cola')
      .set('Authorization', `Bearer ${tokenMunicipal({ comuna_id: 'comuna-1' })}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'permiso-1', motivo_cola: 'CONFLICTO_RESERVA' }]);
    expect(pool.query.mock.calls[0][1]).toEqual(['comuna-1']);
  });
});

describe('PATCH /api/permisos/:id/revocar', () => {
  beforeEach(() => pool.query.mockReset());

  test('403 si el rol no es municipal', async () => {
    const res = await request(app)
      .patch('/api/permisos/permiso-1/revocar')
      .set('Authorization', `Bearer ${tokenChofer()}`)
      .send({ motivo: 'test' });
    expect(res.status).toBe(403);
  });

  test('409 si el permiso ya no puede revocarse', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .patch('/api/permisos/permiso-1/revocar')
      .set('Authorization', `Bearer ${tokenMunicipal()}`)
      .send({ motivo: 'test' });

    expect(res.status).toBe(409);
  });

  test('200 revoca y registra en la bitácora', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{ id: 'permiso-1', estado: 'REVOCADO', revocado_por: 'op-1', revocado_at: '2026-01-01' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'ev-1', created_at: '2026-01-01' }] });

    const res = await request(app)
      .patch('/api/permisos/permiso-1/revocar')
      .set('Authorization', `Bearer ${tokenMunicipal({ id: 'op-1' })}`)
      .send({ motivo: 'incumplimiento' });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('REVOCADO');

    const insertBitacoraCall = pool.query.mock.calls[1];
    expect(insertBitacoraCall[0]).toEqual(expect.stringContaining('INSERT INTO historial_eventos'));
    expect(insertBitacoraCall[1]).toEqual(['permiso-1', 'comuna-1', 'REVOCACION_PERMISO', 'REVOCAR', { motivo: 'incumplimiento' }, 'op-1']);
  });
});

describe('PATCH /api/permisos/:id/asignar-movil', () => {
  beforeEach(() => pool.query.mockReset());

  test('403 para roles no municipales', async () => {
    const res = await request(app)
      .patch('/api/permisos/permiso-1/asignar-movil')
      .set('Authorization', `Bearer ${tokenChofer()}`)
      .send({ identificador_movil: 'M-01' });
    expect(res.status).toBe(403);
  });

  test('201 asigna el móvil y saca al permiso de la cola', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'permiso-1', comuna_id: 'comuna-1', estado: 'EN_COLA_ESPERA' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'movil-1', permiso_id: 'permiso-1', identificador_movil: 'M-01' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ev-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'permiso-1', estado: 'PENDIENTE_CONFIRMACION_MUNICIPAL', motivo_cola: null }] });

    const res = await request(app)
      .patch('/api/permisos/permiso-1/asignar-movil')
      .set('Authorization', `Bearer ${tokenMunicipal()}`)
      .send({ identificador_movil: 'M-01' });

    expect(res.status).toBe(201);
    expect(res.body.permiso.estado).toBe('PENDIENTE_CONFIRMACION_MUNICIPAL');
  });
});
