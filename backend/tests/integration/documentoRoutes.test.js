jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenChofer, tokenMunicipal } = require('../testUtils');

const permisoBase = {
  id: 'permiso-1',
  usuario_id: 'chofer-1',
  comuna_id: 'comuna-1',
  rut_ejecutor: '11111111-1',
  nombre_empresa_ejecutora: 'Constructora X',
  tipo_actividad: 'PROGRAMADA',
  ventana_inicio: '2026-01-01T08:00:00Z',
  ventana_fin: '2026-01-01T18:00:00Z',
};

describe('GET /api/permisos/:id/documento', () => {
  beforeEach(() => pool.query.mockReset());

  test('404 si el permiso no existe', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/permisos/permiso-1/documento').set('Authorization', `Bearer ${tokenChofer({ id: 'chofer-1' })}`);
    expect(res.status).toBe(404);
  });

  test('409 si la municipalidad todavía no se pronuncia', async () => {
    pool.query.mockResolvedValue({ rows: [{ ...permisoBase, estado: 'PENDIENTE_CONFIRMACION_MUNICIPAL' }] });
    const res = await request(app).get('/api/permisos/permiso-1/documento').set('Authorization', `Bearer ${tokenChofer({ id: 'chofer-1' })}`);
    expect(res.status).toBe(409);
  });

  test('200 y PDF real cuando el permiso ya fue aprobado', async () => {
    pool.query.mockResolvedValue({ rows: [{ ...permisoBase, estado: 'APROBADO' }] });

    const res = await request(app)
      .get('/api/permisos/permiso-1/documento')
      .set('Authorization', `Bearer ${tokenChofer({ id: 'chofer-1' })}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });

  test('200 y PDF cuando fue rechazado, buscando el motivo en la bitácora', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ ...permisoBase, estado: 'RECHAZADO' }] })
      .mockResolvedValueOnce({ rows: [{ tipo_evento: 'RECHAZO_PERMISO', detalle: { motivo: 'Faltan datos del vehículo' } }] });

    const res = await request(app)
      .get('/api/permisos/permiso-1/documento')
      .set('Authorization', `Bearer ${tokenMunicipal({ comuna_id: 'comuna-1' })}`);

    expect(res.status).toBe(200);
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });
});
