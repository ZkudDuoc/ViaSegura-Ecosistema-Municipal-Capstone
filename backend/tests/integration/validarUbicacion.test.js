// Validación opcional de la ubicación al iniciar el servicio (VALIDAR_UBICACION).
jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenChofer } = require('../testUtils');

const ID = '3f2b8c1e-9d4a-4c7e-8b1a-2d5e6f7a8b9c';
const FOTO = 'data:image/jpeg;base64,/9j/xxxx';
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const dueno = auth(tokenChofer({ id: 'chofer-1', empresa_id: 'empresa-A' }));
const sesionCodigo = auth(jwt.sign({ tipo: 'CODIGO_CHOFER', permisoId: ID }, process.env.JWT_SECRET));
const UBICACION = { lat: -33.4378, lng: -70.6506 };

const activado = { id: ID, estado: 'ACTIVO', geofencing_confirmado_at: '2026-11-02T10:05:00Z', comuna_id: 'comuna-1' };

afterEach(() => {
  delete process.env.VALIDAR_UBICACION;
});

beforeEach(() => pool.query.mockReset());

describe('VALIDAR_UBICACION apagada (por defecto, para la demo)', () => {
  test('activa sin pedir ubicación y no consulta la distancia', async () => {
    pool.query.mockResolvedValueOnce({ rows: [activado] }).mockResolvedValueOnce({ rows: [{ id: 'ev' }] });

    const res = await request(app).patch(`/api/permisos/${ID}/activar`).set(dueno).send({ foto_evidencia_url: FOTO });

    expect(res.status).toBe(200);
    expect(pool.query.mock.calls.some(([sql]) => sql.includes('ST_DWithin'))).toBe(false);
  });

  test('con VALIDAR_UBICACION=false explícito tampoco la exige', async () => {
    process.env.VALIDAR_UBICACION = 'false';
    pool.query.mockResolvedValueOnce({ rows: [activado] }).mockResolvedValueOnce({ rows: [{ id: 'ev' }] });
    const res = await request(app).patch(`/api/permisos/${ID}/activar`).set(dueno).send({ foto_evidencia_url: FOTO });
    expect(res.status).toBe(200);
  });
});

describe('VALIDAR_UBICACION=true', () => {
  beforeEach(() => {
    process.env.VALIDAR_UBICACION = 'true';
  });

  test.each([
    ['sin ubicación', undefined],
    ['con lat/lng como texto', { lat: '-33.4', lng: '-70.6' }],
    ['sin lng', { lat: -33.4 }],
    ['con latitud fuera de rango', { lat: 91, lng: -70.6 }],
    ['con longitud fuera de rango', { lat: -33.4, lng: 181 }],
  ])('400 UBICACION_REQUERIDA %s, sin tocar la base', async (_nombre, ubicacion) => {
    const res = await request(app).patch(`/api/permisos/${ID}/activar`).set(dueno).send({ foto_evidencia_url: FOTO, ubicacion });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('UBICACION_REQUERIDA');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('422 FUERA_DE_AREA si está a más de 50 m del área, y NO activa el permiso', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ dentro: false }] });

    const res = await request(app)
      .patch(`/api/permisos/${ID}/activar`)
      .set(dueno)
      .send({ foto_evidencia_url: FOTO, ubicacion: UBICACION });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'Estás fuera del área de trabajo', codigo: 'FUERA_DE_AREA' });
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls.some(([sql]) => sql.includes('UPDATE permiso'))).toBe(false);
  });

  test('valida con ST_DWithin sobre geography y un radio de 50 m, en el permiso del propio usuario', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ dentro: false }] });
    await request(app).patch(`/api/permisos/${ID}/activar`).set(dueno).send({ foto_evidencia_url: FOTO, ubicacion: UBICACION });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/ST_DWithin\(area::geography, ST_SetSRID\(ST_MakePoint\(\$2, \$3\), 4326\)::geography, \$4\)/);
    expect(params).toEqual([ID, UBICACION.lng, UBICACION.lat, 50, 'chofer-1']);
  });

  test('200 si está dentro del radio: activa el permiso', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ dentro: true }] })
      .mockResolvedValueOnce({ rows: [activado] })
      .mockResolvedValueOnce({ rows: [{ id: 'ev' }] });

    const res = await request(app)
      .patch(`/api/permisos/${ID}/activar`)
      .set(dueno)
      .send({ foto_evidencia_url: FOTO, ubicacion: UBICACION });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('ACTIVO');
  });

  test('la ubicación SOLO se usa para validar: no se guarda ni queda en la bitácora (Ley 21.719)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ dentro: true }] })
      .mockResolvedValueOnce({ rows: [activado] })
      .mockResolvedValueOnce({ rows: [{ id: 'ev' }] });

    await request(app).patch(`/api/permisos/${ID}/activar`).set(dueno).send({ foto_evidencia_url: FOTO, ubicacion: UBICACION });

    const update = pool.query.mock.calls.find(([sql]) => sql.includes('UPDATE permiso'));
    expect(update[0]).not.toMatch(/lat|lng|ubicacion/i);
    expect(JSON.stringify(update[1])).not.toContain(String(UBICACION.lat));
    expect(JSON.stringify(update[1])).not.toContain(String(UBICACION.lng));

    const bitacora = pool.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO historial_eventos'));
    expect(JSON.stringify(bitacora[1])).not.toContain(String(UBICACION.lat));
    expect(JSON.stringify(bitacora[1])).not.toContain(String(UBICACION.lng));
  });

  test('la sesión de código de chofer también se valida (sin filtrar por usuario)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ dentro: false }] });

    const res = await request(app)
      .patch(`/api/permisos/${ID}/activar`)
      .set(sesionCodigo)
      .send({ foto_evidencia_url: FOTO, ubicacion: UBICACION });

    expect(res.status).toBe(422);
    expect(pool.query.mock.calls[0][1][4]).toBeNull();
  });

  test('si el permiso no existe o no es suyo, sigue el flujo normal y responde 409 (no revela la distancia)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch(`/api/permisos/${ID}/activar`)
      .set(dueno)
      .send({ foto_evidencia_url: FOTO, ubicacion: UBICACION });

    expect(res.status).toBe(409);
  });

  test('foto_evidencia_url sigue siendo obligatoria', async () => {
    const res = await request(app).patch(`/api/permisos/${ID}/activar`).set(dueno).send({ ubicacion: UBICACION });
    expect(res.status).toBe(400);
  });
});
