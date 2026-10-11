// Seguridad mínima de la Semana 6: errores sin filtrar detalles, límite de
// cuerpo, tokens de otro tipo, rate limit de login y registro, cabeceras.
process.env.RATE_LIMIT_AUTH_MAX = '3';

jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const { firmarTokenQr } = require('../../src/utils/jwt');
const app = require('../../src/app');
const { tokenMunicipal } = require('../testUtils');

afterAll(() => {
  process.env.RATE_LIMIT_AUTH_MAX = '10000';
});

beforeEach(() => pool.query.mockReset());

describe('manejo de errores sin filtrar información interna', () => {
  const operador = { Authorization: `Bearer ${tokenMunicipal()}` };
  const ID = '3f2b8c1e-9d4a-4c7e-8b1a-2d5e6f7a8b9c';

  test.each([
    ['22P02', 400, /formato inválido/],
    ['23503', 400, /no existe/],
    ['23505', 409, /Ya existe/],
    ['23514', 400, /reglas de validación/],
    ['23P01', 409, /se solapan/],
    ['22007', 400, /Fecha inválida/],
  ])('código Postgres %s -> %i con mensaje fijo', async (code, status, mensaje) => {
    pool.query.mockRejectedValue(
      Object.assign(new Error('mensaje interno con permiso_no_solape'), {
        code,
        detail: 'Key (email)=(secreto@empresa.cl) already exists.',
        constraint: 'usuario_email_key',
      })
    );

    const res = await request(app).get('/api/panico/cola-local').set(operador);

    expect(res.status).toBe(status);
    expect(res.body.error).toMatch(mensaje);
    const texto = JSON.stringify(res.body);
    expect(texto).not.toMatch(/secreto@empresa|permiso_no_solape|usuario_email_key|Key \(/);
  });

  test('un error desconocido responde 500 genérico, sin el mensaje interno', async () => {
    pool.query.mockRejectedValue(new Error('password authentication failed for user "postgres"'));
    const res = await request(app).get('/api/panico/cola-local').set(operador);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Error interno del servidor' });
  });

  test('un cuerpo mayor a 1 MB responde 413', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.cl', password: 'x'.repeat(1.2 * 1024 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/demasiado grande/);
  });

  test('un JSON mal formado responde 400', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/JSON/);
  });

  test('una ruta inexistente responde 404 JSON', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
  });

  test('asignar móvil con solape de horario (23P01 desde el trigger) responde 409 y no 500', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: ID, comuna_id: 'comuna-1', estado: 'EN_COLA_ESPERA' }] })
      .mockRejectedValueOnce(Object.assign(new Error('exclusion'), { code: '23P01' }));
    const res = await request(app).patch(`/api/permisos/${ID}/asignar-movil`).set(operador).send({ identificador_movil: 'M-01' });
    expect(res.status).toBe(409);
  });
});

describe('tokens de otro tipo no sirven como sesión', () => {
  test('un token de QR no abre un endpoint autenticado', async () => {
    const res = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${firmarTokenQr('permiso-1')}` });
    expect(res.status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('un token firmado con otro algoritmo o secreto es rechazado', async () => {
    const jwt = require('jsonwebtoken');
    const sinFirma = jwt.sign({ sub: 'x', rol: 'OPERADOR_MUNICIPAL' }, '', { algorithm: 'none' });
    const otroSecreto = jwt.sign({ sub: 'x', rol: 'OPERADOR_MUNICIPAL' }, 'otro-secreto');
    expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${sinFirma}` })).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${otroSecreto}` })).status).toBe(401);
  });
});

describe('rate limit de login y registro (429 con Retry-After)', () => {
  test('el login se bloquea tras superar el máximo de intentos', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const respuestas = [];
    for (let i = 0; i < 5; i++) {
      respuestas.push(await request(app).post('/api/auth/login').send({ email: 'x@test.cl', password: 'incorrecta' }));
    }

    expect(respuestas.slice(0, 3).every((r) => r.status === 401)).toBe(true);
    expect(respuestas[3].status).toBe(429);
    expect(Number(respuestas[3].headers['retry-after'])).toBeGreaterThan(0);
    expect(respuestas[3].body.error).toMatch(/Demasiados intentos/);
  });

  test('el registro de empresa también tiene límite, independiente del login', async () => {
    const respuestas = [];
    for (let i = 0; i < 5; i++) {
      respuestas.push(await request(app).post('/api/auth/registrar-empresa').send({}));
    }
    expect(respuestas.slice(0, 3).every((r) => r.status === 400)).toBe(true);
    expect(respuestas[3].status).toBe(429);
  });
});

describe('cabeceras de seguridad', () => {
  test('helmet agrega cabeceras y no expone X-Powered-By', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  test('CORS expone X-Next-Cursor para la paginación', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://empresa.cl');
    expect(res.headers['access-control-expose-headers']).toMatch(/X-Next-Cursor/);
  });
});
