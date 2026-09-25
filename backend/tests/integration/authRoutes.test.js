jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const bcrypt = require('bcrypt');
const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenChofer } = require('../testUtils');

describe('POST /api/auth/registrar', () => {
  beforeEach(() => pool.query.mockReset());

  test('400 si falta empresa_id para un CHOFER de tipo EMPRESA (por defecto)', async () => {
    const res = await request(app)
      .post('/api/auth/registrar')
      .send({ rol: 'CHOFER', nombre: 'Juan', rut: '11111111-1', email: 'juan@test.cl', password: 'clave123' });

    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('201 registra un CHOFER persona natural sin empresa_id', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 'chofer-1', rol: 'CHOFER', nombre: 'Juan', rut: '11111111-1', email: 'juan@test.cl', empresa_id: null, comuna_id: null, tipo_persona: 'NATURAL' }],
    });

    const res = await request(app)
      .post('/api/auth/registrar')
      .send({ rol: 'CHOFER', nombre: 'Juan', rut: '11111111-1', email: 'juan@test.cl', password: 'clave123', tipo_persona: 'NATURAL' });

    expect(res.status).toBe(201);
    expect(res.body.usuario.tipo_persona).toBe('NATURAL');
    expect(res.body.token).toBeDefined();
  });

  test('201 registra un CHOFER de empresa cuando empresa_id existe', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] }) // valida empresa_id
      .mockResolvedValueOnce({
        rows: [{ id: 'chofer-1', rol: 'CHOFER', nombre: 'Juan', rut: '11111111-1', email: 'juan@test.cl', empresa_id: 'empresa-1', comuna_id: null, tipo_persona: 'EMPRESA' }],
      });

    const res = await request(app)
      .post('/api/auth/registrar')
      .send({ rol: 'CHOFER', nombre: 'Juan', rut: '11111111-1', email: 'juan@test.cl', password: 'clave123', empresa_id: 'empresa-1' });

    expect(res.status).toBe(201);
    expect(res.body.usuario.empresa_id).toBe('empresa-1');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => pool.query.mockReset());

  test('401 con credenciales inválidas', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const res = await request(app).post('/api/auth/login').send({ email: 'x@test.cl', password: 'lo-que-sea' });

    expect(res.status).toBe(401);
  });

  test('200 y no expone password_hash', async () => {
    const password_hash = await bcrypt.hash('clave123', 10);
    pool.query.mockResolvedValue({ rows: [{ id: 'chofer-1', rol: 'CHOFER', empresa_id: 'empresa-1', comuna_id: null, password_hash }] });

    const res = await request(app).post('/api/auth/login').send({ email: 'juan@test.cl', password: 'clave123' });

    expect(res.status).toBe(200);
    expect(res.body.usuario.password_hash).toBeUndefined();
    expect(res.body.token).toBeDefined();
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(() => pool.query.mockReset());

  test('401 sin token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('200 con el perfil actualizado del usuario', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 'chofer-1', rol: 'CHOFER', nombre: 'Juan', rut: '11111111-1', email: 'juan@test.cl', empresa_id: 'empresa-1', comuna_id: null, tipo_persona: 'EMPRESA' }],
    });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenChofer()}`);

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Juan');
  });

  test('404 si el usuario del token ya no existe', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenChofer()}`);

    expect(res.status).toBe(404);
  });
});
