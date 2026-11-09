// PATCH /permisos/:id/finalizar con sesión de código de chofer (sin cuenta).
jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { firmarTokenQr } = require('../../src/utils/jwt');
const { tokenChofer, tokenMunicipal } = require('../testUtils');

const ID = '3f2b8c1e-9d4a-4c7e-8b1a-2d5e6f7a8b9c';
const OTRO = '99999999-2222-4333-8444-555555555555';

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const sesionCodigo = (permisoId) => auth(jwt.sign({ tipo: 'CODIGO_CHOFER', permisoId }, process.env.JWT_SECRET));
const choferConCuenta = (rol = 'CHOFER') => auth(tokenChofer({ id: 'chofer-1', empresa_id: 'empresa-A', rol }));

beforeEach(() => pool.query.mockReset());

describe('chofer con código (sin cuenta)', () => {
  test('finaliza SU propio permiso: sin filtrar por usuario_id y con actor nulo en la bitácora', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: ID, estado: 'FINALIZADO', comuna_id: 'comuna-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ev-1' }] });

    const res = await request(app).patch(`/api/permisos/${ID}/finalizar`).set(sesionCodigo(ID));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: ID, estado: 'FINALIZADO' });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/\(\$2::uuid IS NULL OR usuario_id = \$2\)/);
    expect(params[0]).toBe(ID);
    expect(params[1]).toBeNull(); // no se filtra por usuario_id

    const bitacora = pool.query.mock.calls[1][1];
    expect(bitacora[2]).toBe('FINALIZACION_PERMISO');
    expect(bitacora[4]).toEqual({ via: 'CODIGO_CHOFER' });
    expect(bitacora[5]).toBeNull(); // actorId: null
  });

  test('403 si intenta finalizar el permiso de OTRO servicio, sin tocar la base', async () => {
    const res = await request(app).patch(`/api/permisos/${OTRO}/finalizar`).set(sesionCodigo(ID));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/no corresponde a este servicio/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('409 si su permiso no está en un estado finalizable (ya finalizado, aprobado sin iniciar...)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).patch(`/api/permisos/${ID}/finalizar`).set(sesionCodigo(ID));
    expect(res.status).toBe(409);
    expect(pool.query).toHaveBeenCalledTimes(1); // sin bitácora
  });

  test('solo puede finalizar permisos ACTIVOS (la consulta limita los estados)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await request(app).patch(`/api/permisos/${ID}/finalizar`).set(sesionCodigo(ID));
    expect(pool.query.mock.calls[0][1][2]).toEqual(['ACTIVO', 'ACTIVO_PENDIENTE_EVIDENCIA']);
  });
});

describe('usuarios con cuenta', () => {
  test.each(['CHOFER', 'LOGISTICA'])('%s finaliza SU permiso (filtra por usuario_id)', async (rol) => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: ID, estado: 'FINALIZADO', comuna_id: 'comuna-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ev-1' }] });

    const res = await request(app).patch(`/api/permisos/${ID}/finalizar`).set(choferConCuenta(rol));

    expect(res.status).toBe(200);
    expect(pool.query.mock.calls[0][1][1]).toBe('chofer-1');
    expect(pool.query.mock.calls[1][1][5]).toBe('chofer-1'); // actorId
    expect(pool.query.mock.calls[1][1][4]).toBeNull(); // sin marca CODIGO_CHOFER
  });

  test('un chofer con cuenta NO puede finalizar el permiso de otro (409, no se filtra su existencia)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // WHERE usuario_id = chofer-1 no encuentra nada

    const res = await request(app).patch(`/api/permisos/${OTRO}/finalizar`).set(choferConCuenta());

    expect(res.status).toBe(409);
    expect(pool.query.mock.calls[0][1]).toEqual([OTRO, 'chofer-1', ['ACTIVO', 'ACTIVO_PENDIENTE_EVIDENCIA']]);
  });

  test('un operador municipal no puede finalizar (403 sin tocar la base)', async () => {
    const res = await request(app).patch(`/api/permisos/${ID}/finalizar`).set(auth(tokenMunicipal()));
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('401 sin token', async () => {
    expect((await request(app).patch(`/api/permisos/${ID}/finalizar`)).status).toBe(401);
  });
});

describe('un token de QR no se puede usar como sesión', () => {
  const tokenQr = auth(firmarTokenQr(ID));

  test.each([
    ['finalizar', 'patch', 'finalizar'],
    ['activar', 'patch', 'activar'],
  ])('401 al intentar %s con el token del QR (quien lo escanea no puede actuar sobre el permiso)', async (_n, metodo, accion) => {
    const res = await request(app)
      [metodo](`/api/permisos/${ID}/${accion}`)
      .set(tokenQr)
      .send({ foto_evidencia_url: 'data:image/jpeg;base64,xxx' });

    expect(res.status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
