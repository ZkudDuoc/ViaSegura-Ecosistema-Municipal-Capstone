jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenChofer, tokenMunicipal } = require('../testUtils');

const logistica = (empresa_id = 'empresa-A') => tokenChofer({ id: 'logistica-1', empresa_id, rol: 'LOGISTICA' });
const chofer = (empresa_id = 'empresa-A') => tokenChofer({ id: 'chofer-1', empresa_id, rol: 'CHOFER' });
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const ID = '3f2b8c1e-9d4a-4c7e-8b1a-2d5e6f7a8b9c';

const TRABAJADOR = { id: ID, rut: '12345678-5', nombre: 'Juan Pérez', cargo: 'Operador grúa', activo: true };

beforeEach(() => pool.query.mockReset());

describe('permisos de acceso', () => {
  test('401 sin token', async () => {
    expect((await request(app).get('/api/trabajadores')).status).toBe(401);
  });

  test('403 para roles municipales', async () => {
    const res = await request(app).get('/api/trabajadores').set(auth(tokenMunicipal()));
    expect(res.status).toBe(403);
  });

  test('el CHOFER solo consulta: no puede crear, editar, borrar ni importar', async () => {
    const t = auth(chofer());
    expect((await request(app).post('/api/trabajadores').set(t).send(TRABAJADOR)).status).toBe(403);
    expect((await request(app).patch(`/api/trabajadores/${ID}`).set(t).send({ cargo: 'x' })).status).toBe(403);
    expect((await request(app).delete(`/api/trabajadores/${ID}`).set(t)).status).toBe(403);
    expect((await request(app).post('/api/trabajadores/importar').set(t).send({ trabajadores: [] })).status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('403 si la cuenta no tiene empresa', async () => {
    const res = await request(app).get('/api/trabajadores').set(auth(tokenChofer({ empresa_id: null, rol: 'LOGISTICA' })));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/trabajadores', () => {
  test('el CHOFER puede consultar; por defecto solo activos, de SU empresa', async () => {
    pool.query.mockResolvedValue({ rows: [{ ...TRABAJADOR, cursor_creado: 't1' }] });

    const res = await request(app).get('/api/trabajadores').set(auth(chofer('empresa-A')));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [TRABAJADOR], next_cursor: null });
    const [sql, params] = pool.query.mock.calls[0];
    expect(params[0]).toBe('empresa-A');
    expect(params[1]).toBe(true); // activo = true
    expect(sql).toMatch(/empresa_id = \$1/);
  });

  test('busca por nombre o RUT ignorando los puntos', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    await request(app).get('/api/trabajadores?q=12.345').set(auth(logistica()));
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/nombre ILIKE .* OR rut ILIKE/);
    expect(params).toContain('%12345%');
  });

  test('activo=todos no filtra por estado y activo=false trae las bajas', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    await request(app).get('/api/trabajadores?activo=todos').set(auth(logistica()));
    expect(pool.query.mock.calls[0][1]).toEqual(['empresa-A', 26]);

    pool.query.mockClear();
    await request(app).get('/api/trabajadores?activo=false').set(auth(logistica()));
    expect(pool.query.mock.calls[0][1]).toEqual(['empresa-A', false, 26]);
  });

  test('pagina con cursor: sin duplicados ni saltos entre páginas', async () => {
    const filas = [1, 2, 3].map((n) => ({ ...TRABAJADOR, id: `id-${n}`, cursor_creado: `2026-01-0${n} 00:00:00+00` }));
    pool.query.mockResolvedValueOnce({ rows: filas }); // limit=2 pide 3

    const pagina1 = await request(app).get('/api/trabajadores?limit=2').set(auth(logistica()));
    expect(pagina1.body.items.map((i) => i.id)).toEqual(['id-1', 'id-2']);
    expect(pagina1.body.next_cursor).toBeTruthy();
    expect(pool.query.mock.calls[0][1].at(-1)).toBe(3);
  });

  test('400 con un cursor inválido', async () => {
    const res = await request(app).get('/api/trabajadores?cursor=basura').set(auth(logistica()));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/trabajadores', () => {
  test('400 con RUT inválido, sin tocar la base', async () => {
    const res = await request(app).post('/api/trabajadores').set(auth(logistica())).send({ rut: '12345678-9', nombre: 'Juan' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/RUT/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('400 sin nombre o con fechas mal formadas', async () => {
    const sinNombre = await request(app).post('/api/trabajadores').set(auth(logistica())).send({ rut: '12345678-5' });
    expect(sinNombre.status).toBe(400);
    const fechaMala = await request(app)
      .post('/api/trabajadores')
      .set(auth(logistica()))
      .send({ rut: '12345678-5', nombre: 'Juan', contrato_vigente_hasta: '31/12/2026' });
    expect(fechaMala.status).toBe(400);
  });

  test('201 crea el trabajador en la empresa del usuario con el RUT normalizado', async () => {
    pool.query.mockResolvedValue({ rows: [TRABAJADOR] });

    const res = await request(app)
      .post('/api/trabajadores')
      .set(auth(logistica('empresa-A')))
      .send({ rut: '12.345.678-5', nombre: ' Juan Pérez ', cargo: 'Operador grúa', contrato_vigente_hasta: '2026-12-31' });

    expect(res.status).toBe(201);
    const params = pool.query.mock.calls[0][1];
    expect(params.slice(0, 4)).toEqual(['empresa-A', '12345678-5', 'Juan Pérez', 'Operador grúa']);
    expect(params[4]).toBe('2026-12-31');
  });

  test('409 si el RUT ya está en la nómina', async () => {
    pool.query.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    const res = await request(app).post('/api/trabajadores').set(auth(logistica())).send({ rut: '12345678-5', nombre: 'Juan' });
    expect(res.status).toBe(409);
  });
});

describe('PATCH y DELETE /api/trabajadores/:id', () => {
  test('400 con id que no es UUID', async () => {
    const res = await request(app).patch('/api/trabajadores/123').set(auth(logistica())).send({ cargo: 'x' });
    expect(res.status).toBe(400);
  });

  test('400 si no hay campos para actualizar', async () => {
    const res = await request(app).patch(`/api/trabajadores/${ID}`).set(auth(logistica())).send({});
    expect(res.status).toBe(400);
  });

  test('actualiza solo los campos enviados, dentro de la empresa del usuario', async () => {
    pool.query.mockResolvedValue({ rows: [{ ...TRABAJADOR, cargo: 'Capataz' }] });

    const res = await request(app).patch(`/api/trabajadores/${ID}`).set(auth(logistica('empresa-A'))).send({ cargo: 'Capataz' });

    expect(res.status).toBe(200);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/SET cargo = \$3 WHERE id = \$1 AND empresa_id = \$2/);
    expect(params).toEqual([ID, 'empresa-A', 'Capataz']);
  });

  test('acceso cruzado: la empresa B no puede editar ni dar de baja un trabajador de la empresa A', async () => {
    pool.query.mockResolvedValue({ rows: [] }); // el WHERE empresa_id = B no encuentra nada

    const editar = await request(app).patch(`/api/trabajadores/${ID}`).set(auth(logistica('empresa-B'))).send({ cargo: 'x' });
    expect(editar.status).toBe(404);
    expect(pool.query.mock.calls[0][1][1]).toBe('empresa-B');

    const baja = await request(app).delete(`/api/trabajadores/${ID}`).set(auth(logistica('empresa-B')));
    expect(baja.status).toBe(404);

    const ver = await request(app).get(`/api/trabajadores/${ID}`).set(auth(logistica('empresa-B')));
    expect(ver.status).toBe(404);
  });

  test('DELETE es baja lógica (activo = false), no borra la fila', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: ID, activo: false }] });
    const res = await request(app).delete(`/api/trabajadores/${ID}`).set(auth(logistica()));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: ID, activo: false });
    expect(pool.query.mock.calls[0][0]).toMatch(/UPDATE trabajador SET activo = false/);
    expect(pool.query.mock.calls[0][0]).not.toMatch(/DELETE FROM/);
  });
});

describe('POST /api/trabajadores/importar', () => {
  test('400 si no trae filas o el formato no es válido', async () => {
    expect((await request(app).post('/api/trabajadores/importar').set(auth(logistica())).send({})).status).toBe(400);
    expect((await request(app).post('/api/trabajadores/importar').set(auth(logistica())).send({ trabajadores: [] })).status).toBe(400);
  });

  test('importa JSON y reporta creados, actualizados y errores fila por fila', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ creado: true }] }) // fila 1: nuevo
      .mockResolvedValueOnce({ rows: [{ creado: false }] }); // fila 3: ya existía

    const res = await request(app)
      .post('/api/trabajadores/importar')
      .set(auth(logistica()))
      .send({
        trabajadores: [
          { rut: '12345678-5', nombre: 'Juan', cargo: 'Operador' },
          { rut: '11111111-2', nombre: 'RUT malo' },
          { rut: '11111111-1', nombre: 'Ana', epp_vigente_hasta: '2026-12-31' },
          { rut: '22222222-2', nombre: '' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.creados).toBe(1);
    expect(res.body.actualizados).toBe(1);
    expect(res.body.errores).toEqual([
      { fila: 2, motivo: 'El RUT del trabajador no es válido' },
      { fila: 4, motivo: 'El nombre es obligatorio' },
    ]);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  test('importa un CSV (text/csv) con separador ; y alias de columnas', async () => {
    pool.query.mockResolvedValue({ rows: [{ creado: true }] });
    const csv = 'rut;nombre;cargo;contrato;epp\n12345678-5;Juan Pérez;Operador;2026-12-31;2026-11-30\n11111111-1;Ana Soto;Maestra;;\n';

    const res = await request(app)
      .post('/api/trabajadores/importar')
      .set(auth(logistica()))
      .set('Content-Type', 'text/csv')
      .send(csv);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ creados: 2, actualizados: 0, errores: [] });
    const primera = pool.query.mock.calls[0][1];
    expect(primera).toEqual(['empresa-A', '12345678-5', 'Juan Pérez', 'Operador', '2026-12-31', '2026-11-30']);
    const segunda = pool.query.mock.calls[1][1];
    expect(segunda.slice(4)).toEqual([null, null]);
  });

  test('una fila que falla en la base no detiene el resto de la importación', async () => {
    pool.query.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ rows: [{ creado: true }] });

    const res = await request(app)
      .post('/api/trabajadores/importar')
      .set(auth(logistica()))
      .send({ trabajadores: [{ rut: '12345678-5', nombre: 'A' }, { rut: '11111111-1', nombre: 'B' }] });

    expect(res.status).toBe(200);
    expect(res.body.creados).toBe(1);
    expect(res.body.errores).toEqual([{ fila: 1, motivo: 'No se pudo guardar la fila' }]);
  });

  test('400 si excede el máximo de filas por importación', async () => {
    const filas = Array.from({ length: 501 }, () => ({ rut: '12345678-5', nombre: 'X' }));
    const res = await request(app).post('/api/trabajadores/importar').set(auth(logistica())).send({ trabajadores: filas });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/500/);
  });
});
