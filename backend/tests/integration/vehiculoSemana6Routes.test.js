jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenChofer } = require('../testUtils');

const logistica = (empresa_id = 'empresa-A') => tokenChofer({ id: 'logistica-1', empresa_id, rol: 'LOGISTICA' });
const chofer = (empresa_id = 'empresa-A') => tokenChofer({ id: 'chofer-1', empresa_id, rol: 'CHOFER' });
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const ID = '3f2b8c1e-9d4a-4c7e-8b1a-2d5e6f7a8b9c';

beforeEach(() => pool.query.mockReset());

describe('GET /api/vehiculos (búsqueda y paginación)', () => {
  test('sin limit devuelve todos los activos como array (contrato anterior)', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: ID, patente: 'ABCD12', cursor_clave: 'ABCD12' }] });
    const res = await request(app).get('/api/vehiculos').set(auth(chofer()));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: ID, patente: 'ABCD12' }]);
    expect(pool.query.mock.calls[0][0]).toMatch(/activo = true/);
  });

  test('?q= busca por patente ignorando guiones, espacios y mayúsculas', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    await request(app).get('/api/vehiculos?q=ab-cd%2012').set(auth(chofer()));
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/patente ILIKE \$2/);
    expect(params).toEqual(['empresa-A', '%ABCD12%']);
  });

  test('con limit pagina y entrega el siguiente cursor en X-Next-Cursor', async () => {
    pool.query.mockResolvedValue({
      rows: [
        { id: 'a', patente: 'AAAA11', cursor_clave: 'AAAA11' },
        { id: 'b', patente: 'BBBB22', cursor_clave: 'BBBB22' },
        { id: 'c', patente: 'CCCC33', cursor_clave: 'CCCC33' },
      ],
    });

    const res = await request(app).get('/api/vehiculos?limit=2').set(auth(chofer()));

    expect(res.status).toBe(200);
    expect(res.body.map((v) => v.id)).toEqual(['a', 'b']);
    expect(res.headers['x-next-cursor']).toBeTruthy();
    expect(pool.query.mock.calls[0][1].at(-1)).toBe(3);
  });

  test('400 con cursor inválido', async () => {
    const res = await request(app).get('/api/vehiculos?limit=2&cursor=basura').set(auth(chofer()));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/vehiculos/:id', () => {
  test('403 para el CHOFER (solo LOGISTICA edita)', async () => {
    const res = await request(app).patch(`/api/vehiculos/${ID}`).set(auth(chofer())).send({ patente: 'ZZZZ99' });
    expect(res.status).toBe(403);
  });

  test('400 con id inválido, medidas no positivas o sin campos', async () => {
    const t = auth(logistica());
    expect((await request(app).patch('/api/vehiculos/123').set(t).send({ patente: 'X' })).status).toBe(400);
    expect((await request(app).patch(`/api/vehiculos/${ID}`).set(t).send({ alto_m: -3 })).status).toBe(400);
    expect((await request(app).patch(`/api/vehiculos/${ID}`).set(t).send({})).status).toBe(400);
  });

  test('actualiza solo los campos enviados y solo si el camión es de SU empresa', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: ID, patente: 'ZZZZ99', alto_m: 4.5 }] });

    const res = await request(app).patch(`/api/vehiculos/${ID}`).set(auth(logistica('empresa-A'))).send({ alto_m: 4.5 });

    expect(res.status).toBe(200);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/SET alto_m = \$3 WHERE id = \$1 AND empresa_id = \$2/);
    expect(params).toEqual([ID, 'empresa-A', 4.5]);
  });

  test('404 si el camión es de otra empresa', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).patch(`/api/vehiculos/${ID}`).set(auth(logistica('empresa-B'))).send({ alto_m: 4 });
    expect(res.status).toBe(404);
  });

  test('409 si la patente ya existe', async () => {
    pool.query.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    const res = await request(app).patch(`/api/vehiculos/${ID}`).set(auth(logistica())).send({ patente: 'DUPL11' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/vehiculos/:id', () => {
  test('403 para el CHOFER', async () => {
    expect((await request(app).delete(`/api/vehiculos/${ID}`).set(auth(chofer()))).status).toBe(403);
  });

  test('baja lógica: marca activo = false, no borra (los permisos lo referencian)', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: ID, activo: false }] });
    const res = await request(app).delete(`/api/vehiculos/${ID}`).set(auth(logistica()));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: ID, activo: false });
    expect(pool.query.mock.calls[0][0]).toMatch(/UPDATE vehiculo SET activo = false/);
  });

  test('404 si no existe, es de otra empresa o ya estaba dado de baja', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).delete(`/api/vehiculos/${ID}`).set(auth(logistica('empresa-B')));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/vehiculos', () => {
  test('409 si la patente ya existe', async () => {
    pool.query.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    const res = await request(app)
      .post('/api/vehiculos')
      .set(auth(logistica()))
      .send({ patente: 'ABCD12', alto_m: 4, ancho_m: 2.5, largo_m: 10, peso_ton: 15 });
    expect(res.status).toBe(409);
  });

  test('400 con medidas no numéricas o negativas', async () => {
    const res = await request(app)
      .post('/api/vehiculos')
      .set(auth(logistica()))
      .send({ patente: 'ABCD12', alto_m: 'alto', ancho_m: 2.5, largo_m: 10, peso_ton: 15 });
    expect(res.status).toBe(400);
  });
});
