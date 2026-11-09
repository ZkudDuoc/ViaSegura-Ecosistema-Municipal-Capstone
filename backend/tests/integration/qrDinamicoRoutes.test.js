// QR dinámico que funciona sin conexión (TOTP): el teléfono recibe el secreto
// una vez (GET /permisos/:id/qr-secreto) y el supervisor valida
// VS1.<permisoId>.<codigo> en GET /permisos/qr/:token.
jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const totp = require('../../src/services/totpService');
const { firmarTokenQr } = require('../../src/utils/jwt');
const { tokenChofer, tokenMunicipal } = require('../testUtils');

const ID = '3f2b8c1e-9d4a-4c7e-8b1a-2d5e6f7a8b9c';
const SECRETO = Buffer.from('secreto-de-prueba-para-el-qr-dinamico-123456').toString('base64');
const CLAVE = Buffer.from(SECRETO, 'base64');
const AHORA = 1760000010 * 1000;

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const dueno = auth(tokenChofer({ id: 'chofer-1', empresa_id: 'empresa-A' }));
const operador = auth(tokenMunicipal({ comuna_id: 'comuna-1' }));
const sesionCodigo = (permisoId = ID) => auth(jwt.sign({ tipo: 'CODIGO_CHOFER', permisoId }, process.env.JWT_SECRET));

let reloj;

beforeEach(() => {
  pool.query.mockReset();
  reloj = jest.spyOn(Date, 'now').mockReturnValue(AHORA);
});

afterEach(() => reloj.mockRestore());

describe('GET /api/permisos/:id/qr-secreto', () => {
  test('401 sin token y 400 con un id que no es UUID', async () => {
    expect((await request(app).get(`/api/permisos/${ID}/qr-secreto`)).status).toBe(401);
    expect((await request(app).get('/api/permisos/123/qr-secreto').set(dueno)).status).toBe(400);
  });

  test('404 si el permiso no existe y 403 si no es del usuario', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    expect((await request(app).get(`/api/permisos/${ID}/qr-secreto`).set(dueno)).status).toBe(404);

    pool.query.mockResolvedValueOnce({ rows: [{ usuario_id: 'otro-chofer' }] });
    expect((await request(app).get(`/api/permisos/${ID}/qr-secreto`).set(dueno)).status).toBe(403);
  });

  test('un operador municipal no obtiene el secreto del chofer', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ usuario_id: 'chofer-1' }] });
    const res = await request(app).get(`/api/permisos/${ID}/qr-secreto`).set(operador);
    expect(res.status).toBe(403);
  });

  test('200 crea el secreto la primera vez y responde con los parámetros del TOTP', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ usuario_id: 'chofer-1' }] })
      .mockResolvedValueOnce({ rows: [] }) // INSERT ... ON CONFLICT DO NOTHING
      .mockResolvedValueOnce({ rows: [{ secreto: SECRETO }] });

    const res = await request(app).get(`/api/permisos/${ID}/qr-secreto`).set(dueno);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ secreto: SECRETO, periodo: 30, digitos: 8, algoritmo: 'SHA-256', servidor_ahora: AHORA });
    expect(res.headers['cache-control']).toBe('no-store');

    const [sqlInsert, paramsInsert] = pool.query.mock.calls[1];
    expect(sqlInsert).toMatch(/INSERT INTO permiso_qr_secreto/);
    expect(sqlInsert).toMatch(/ON CONFLICT \(permiso_id\) DO NOTHING/);
    expect(paramsInsert[0]).toBe(ID);
    // 32 bytes aleatorios en base64.
    expect(Buffer.from(paramsInsert[1], 'base64')).toHaveLength(32);
  });

  test('las siguientes veces devuelve el MISMO secreto (el que ya estaba guardado)', async () => {
    const guardado = Buffer.from('ya-existia-0000000000000000000000').toString('base64');
    pool.query
      .mockResolvedValueOnce({ rows: [{ usuario_id: 'chofer-1' }] })
      .mockResolvedValueOnce({ rows: [] }) // el INSERT no hace nada: ya existía
      .mockResolvedValueOnce({ rows: [{ secreto: guardado }] });

    const res = await request(app).get(`/api/permisos/${ID}/qr-secreto`).set(dueno);

    expect(res.body.secreto).toBe(guardado); // no el que generó el INSERT descartado
  });

  test('la sesión de código de chofer obtiene el secreto de SU permiso, y de ningún otro', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ usuario_id: 'otro-usuario' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ secreto: SECRETO }] });
    const propio = await request(app).get(`/api/permisos/${ID}/qr-secreto`).set(sesionCodigo(ID));
    expect(propio.status).toBe(200);

    pool.query.mockReset();
    const ajeno = await request(app).get(`/api/permisos/${ID}/qr-secreto`).set(sesionCodigo('11111111-2222-4333-8444-555555555555'));
    expect(ajeno.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('el secreto NUNCA aparece en el detalle del permiso (vive en otra tabla)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: ID, usuario_id: 'chofer-1', comuna_id: 'comuna-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/api/permisos/${ID}`).set(dueno);

    expect(JSON.stringify(res.body)).not.toMatch(/secreto/);
    expect(pool.query.mock.calls[0][0]).not.toMatch(/permiso_qr_secreto/);
  });
});

describe('GET /api/permisos/qr/:token con el formato VS1.<permisoId>.<codigo>', () => {
  const detalleMock = () =>
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: ID, usuario_id: 'chofer-1', comuna_id: 'comuna-1', estado: 'ACTIVO' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

  const qr = (codigo, permisoId = ID) => `VS1.${permisoId}.${codigo}`;
  const verificar = (token) => request(app).get(`/api/permisos/qr/${token}`).set(operador);

  test('200 con el código del paso actual: devuelve el detalle del permiso', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ secreto: SECRETO }] });
    detalleMock();

    const res = await verificar(qr(totp.generarCodigo(CLAVE, AHORA)));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ID);
    expect(pool.query.mock.calls[0][1]).toEqual([ID]);
  });

  test.each([
    ['anterior', -1],
    ['siguiente', 1],
  ])('200 con el código del paso %s (tolera el desfase de reloj del teléfono)', async (_nombre, desfase) => {
    pool.query.mockResolvedValueOnce({ rows: [{ secreto: SECRETO }] });
    detalleMock();
    const res = await verificar(qr(totp.generarCodigo(CLAVE, AHORA, desfase)));
    expect(res.status).toBe(200);
  });

  test.each([
    ['vencido (2 pasos atrás, ≥ 60 s)', -2],
    ['de un paso demasiado futuro', 2],
    ['de hace 10 minutos (captura de pantalla vieja)', -20],
  ])('400 con un código %s', async (_nombre, desfase) => {
    pool.query.mockResolvedValueOnce({ rows: [{ secreto: SECRETO }] });
    const res = await verificar(qr(totp.generarCodigo(CLAVE, AHORA, desfase)));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'QR inválido o expirado' });
    expect(pool.query).toHaveBeenCalledTimes(1); // nunca llega a leer el detalle
  });

  test('un código vigente deja de servir cuando pasa el tiempo', async () => {
    const codigo = totp.generarCodigo(CLAVE, AHORA);

    reloj.mockReturnValue(AHORA + 29 * 1000);
    pool.query.mockResolvedValueOnce({ rows: [{ secreto: SECRETO }] });
    detalleMock();
    expect((await verificar(qr(codigo))).status).toBe(200);

    pool.query.mockReset();
    reloj.mockReturnValue(AHORA + 3 * 60 * 1000);
    pool.query.mockResolvedValueOnce({ rows: [{ secreto: SECRETO }] });
    expect((await verificar(qr(codigo))).status).toBe(400);
  });

  test('400 con un código equivocado, mal formado o de otro permiso', async () => {
    pool.query.mockResolvedValue({ rows: [{ secreto: SECRETO }] });
    const correcto = totp.generarCodigo(CLAVE, AHORA);
    const equivocado = correcto === '00000000' ? '11111111' : '00000000';

    expect((await verificar(qr(equivocado))).status).toBe(400);
    expect((await verificar(qr('1234567'))).status).toBe(400);
    expect((await verificar(qr('abcdefgh'))).status).toBe(400);
    expect((await verificar(qr(`${correcto}9`))).status).toBe(400);
  });

  test('400 si el permiso no tiene secreto (nunca generó un QR dinámico)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await verificar(qr('12345678'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('QR inválido o expirado');
  });

  test('400 si el id del QR no es un UUID, sin consultar la base', async () => {
    const res = await verificar(qr('12345678', 'no-es-uuid'));
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('el código de un permiso no sirve con el id de otro permiso', async () => {
    const OTRO = '99999999-2222-4333-8444-555555555555';
    pool.query.mockResolvedValueOnce({ rows: [{ secreto: Buffer.from('secreto-del-otro-permiso-000000000000').toString('base64') }] });
    const res = await verificar(qr(totp.generarCodigo(CLAVE, AHORA), OTRO));
    expect(res.status).toBe(400);
  });

  test('un operador de OTRA comuna recibe 403 aunque el código sea válido', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ secreto: SECRETO }] });
    detalleMock();
    const res = await request(app)
      .get(`/api/permisos/qr/${qr(totp.generarCodigo(CLAVE, AHORA))}`)
      .set(auth(tokenMunicipal({ comuna_id: 'comuna-2' })));
    expect(res.status).toBe(403);
  });

  test('solo roles municipales pueden verificar', async () => {
    const res = await request(app).get(`/api/permisos/qr/${qr('12345678')}`).set(dueno);
    expect(res.status).toBe(403);
  });

  test('los tokens JWT del QR anterior siguen funcionando', async () => {
    detalleMock();
    const res = await verificar(firmarTokenQr(ID));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ID);
  });

  test('un token basura sigue dando 400 (el supervisor ya maneja ese caso)', async () => {
    const res = await verificar('token-basura');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválido|expirado/i);
  });
});
