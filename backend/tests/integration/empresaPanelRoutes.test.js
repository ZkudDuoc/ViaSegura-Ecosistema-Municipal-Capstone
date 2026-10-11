jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenChofer, tokenMunicipal } = require('../testUtils');

const logistica = (empresa_id = 'empresa-A') => tokenChofer({ id: 'logistica-1', empresa_id, rol: 'LOGISTICA' });
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const ID = '3f2b8c1e-9d4a-4c7e-8b1a-2d5e6f7a8b9c';
const uid = (n) => `00000000-0000-4000-8000-00000000000${n}`;

const fila = (n, extra = {}) => ({
  id: uid(n),
  patente: 'ABCD12',
  estado: 'APROBADO',
  tipo_actividad: 'PROGRAMADA',
  rut_ejecutor: '11111111-1',
  ventana_inicio: '2026-10-20T10:00:00Z',
  ventana_fin: '2026-10-20T18:00:00Z',
  created_at: `2026-10-0${n}T10:00:00Z`,
  nivel_riesgo: 'ALTO',
  score_riesgo: 80,
  n_multas: 0,
  cursor_creado: `2026-10-0${n} 10:00:00+00`,
  ...extra,
});

beforeEach(() => pool.query.mockReset());

describe('acceso', () => {
  test.each(['/api/empresa/resumen', '/api/empresa/estadisticas', '/api/empresa/solicitudes'])('%s: 401 sin token y 403 para municipales', async (ruta) => {
    expect((await request(app).get(ruta)).status).toBe(401);
    expect((await request(app).get(ruta).set(auth(tokenMunicipal()))).status).toBe(403);
  });

  test('403 si la cuenta no tiene empresa', async () => {
    const res = await request(app)
      .get('/api/empresa/solicitudes')
      .set(auth(tokenChofer({ empresa_id: null, rol: 'LOGISTICA' })));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/empresa/solicitudes', () => {
  test('lista TODAS las solicitudes de la empresa (no solo las del usuario) con riesgo y multas', async () => {
    pool.query.mockResolvedValue({ rows: [fila(1, { n_multas: 2 }), fila(2, { nivel_riesgo: null })] });

    const res = await request(app).get('/api/empresa/solicitudes').set(auth(logistica('empresa-A')));

    expect(res.status).toBe(200);
    expect(res.body.next_cursor).toBeNull();
    expect(res.body.items[0]).toEqual(
      expect.objectContaining({ id: uid(1), patente: 'ABCD12', riesgo: 'Alto', score_riesgo: 80, n_multas: 2, tiene_multas: true })
    );
    expect(res.body.items[1]).toEqual(expect.objectContaining({ riesgo: null, tiene_multas: false }));
    expect(res.body.items[0].cursor_creado).toBeUndefined();
    expect(res.body.items[0].nivel_riesgo).toBeUndefined();

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/p\.empresa_id = \$1/);
    expect(sql).not.toMatch(/p\.usuario_id =/);
    expect(params[0]).toBe('empresa-A');
  });

  test('paginación por cursor: 25 por defecto, máx. 100, y entrega next_cursor', async () => {
    pool.query.mockResolvedValue({ rows: [fila(1), fila(2), fila(3)] });

    const pagina = await request(app).get('/api/empresa/solicitudes?limit=2').set(auth(logistica()));
    expect(pagina.body.items.map((i) => i.id)).toEqual([uid(1), uid(2)]);
    expect(pagina.body.next_cursor).toBeTruthy();
    expect(pool.query.mock.calls[0][1].at(-1)).toBe(3);

    pool.query.mockClear();
    pool.query.mockResolvedValue({ rows: [] });
    await request(app).get('/api/empresa/solicitudes').set(auth(logistica()));
    expect(pool.query.mock.calls[0][1].at(-1)).toBe(26);

    pool.query.mockClear();
    await request(app).get('/api/empresa/solicitudes?limit=9999').set(auth(logistica()));
    expect(pool.query.mock.calls[0][1].at(-1)).toBe(101);
  });

  test('la segunda página usa el cursor de la primera (sin duplicados ni saltos)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [fila(3), fila(2), fila(1)] });
    const p1 = await request(app).get('/api/empresa/solicitudes?limit=2').set(auth(logistica()));

    pool.query.mockResolvedValueOnce({ rows: [fila(1)] });
    const p2 = await request(app)
      .get(`/api/empresa/solicitudes?limit=2&cursor=${encodeURIComponent(p1.body.next_cursor)}`)
      .set(auth(logistica()));

    expect(p2.body.items.map((i) => i.id)).toEqual([uid(1)]);
    expect(p2.body.next_cursor).toBeNull();
    const [sql, params] = pool.query.mock.calls[1];
    expect(sql).toMatch(/\(p\.created_at, p\.id\) < \(\$\d+::timestamptz, \$\d+::uuid\)/);
    expect(params).toContain('2026-10-02 10:00:00+00');
    expect(params).toContain(uid(2));
  });

  test('con orden=asc la comparación del cursor se invierte', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const cursor = Buffer.from(JSON.stringify({ c: '2026-10-01 10:00:00+00', i: ID })).toString('base64url');
    await request(app).get(`/api/empresa/solicitudes?orden=asc&cursor=${cursor}`).set(auth(logistica()));
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toMatch(/\(p\.created_at, p\.id\) > /);
    expect(sql).toMatch(/ORDER BY p\.created_at ASC, p\.id ASC/);
  });

  test.each([
    ['pendiente', /p\.estado IN \('PENDIENTE_CONFIRMACION_MUNICIPAL', 'EN_COLA_ESPERA'\)/],
    ['aprobada_futura', /p\.estado = 'APROBADO' AND p\.ventana_inicio > now\(\)/],
    ['en_curso', /p\.estado IN \('ACTIVO', 'ACTIVO_PENDIENTE_EVIDENCIA'\)/],
    ['terminada', /p\.estado IN \('FINALIZADO', 'EXPIRADO'\)/],
    ['rechazada', /p\.estado = 'RECHAZADO'/],
    ['en_revision', /p\.estado = 'EN_REVISION'/],
    ['por_aplazar', /p\.estado = 'EN_REVISION'/],
  ])('grupo=%s filtra por los estados que corresponden', async (grupo, patron) => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get(`/api/empresa/solicitudes?grupo=${grupo}`).set(auth(logistica()));
    expect(res.status).toBe(200);
    expect(pool.query.mock.calls[0][0]).toMatch(patron);
  });

  test('acepta un estado exacto y rechaza grupos desconocidos', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const exacto = await request(app).get('/api/empresa/solicitudes?grupo=SUSPENDIDO').set(auth(logistica()));
    expect(exacto.status).toBe(200);
    expect(pool.query.mock.calls[0][1]).toContain('SUSPENDIDO');

    const malo = await request(app).get('/api/empresa/solicitudes?grupo=inventado').set(auth(logistica()));
    expect(malo.status).toBe(400);
  });

  test('combina filtros: fecha, multas, búsqueda y estado', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .get('/api/empresa/solicitudes?desde=2026-10-01&hasta=2026-10-31&con_multas=true&grupo=terminada&q=abcd-12')
      .set(auth(logistica()));

    expect(res.status).toBe(200);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/p\.ventana_inicio >= \$\d+/);
    expect(sql).toMatch(/p\.ventana_inicio <= \$\d+/);
    expect(sql).toMatch(/AND EXISTS \(SELECT 1 FROM infraccion i WHERE i\.permiso_id = p\.id\)/);
    expect(sql).toMatch(/FINALIZADO/);
    expect(sql).toMatch(/ILIKE/);
    expect(params).toContain('%abcd12%');
  });

  test('con_multas=false excluye las solicitudes con multas', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    await request(app).get('/api/empresa/solicitudes?con_multas=false').set(auth(logistica()));
    expect(pool.query.mock.calls[0][0]).toMatch(/AND NOT EXISTS \(SELECT 1 FROM infraccion/);
  });

  test.each(['desde=abc', 'hasta=31-12-2026', 'con_multas=quizas', 'orden=raro', 'cursor=basura'])('400 con %s', async (query) => {
    const res = await request(app).get(`/api/empresa/solicitudes?${query}`).set(auth(logistica()));
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('GET /api/empresa/solicitudes/:id/multas', () => {
  test('400 con id inválido', async () => {
    expect((await request(app).get('/api/empresa/solicitudes/123/multas').set(auth(logistica()))).status).toBe(400);
  });

  test('404 si la solicitud es de otra empresa', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get(`/api/empresa/solicitudes/${ID}/multas`).set(auth(logistica('empresa-B')));
    expect(res.status).toBe(404);
    expect(pool.query.mock.calls[0][1]).toEqual([ID, 'empresa-B']);
  });

  test('200 con las multas y su detalle', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: ID }] })
      .mockResolvedValueOnce({ rows: [{ id: 'm1', descripcion: 'Sin conos', rut_infractor: '11111111-1', inspector: 'Ana' }] });

    const res = await request(app).get(`/api/empresa/solicitudes/${ID}/multas`).set(auth(logistica()));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'm1', descripcion: 'Sin conos', rut_infractor: '11111111-1', inspector: 'Ana' }]);
  });
});

describe('GET /api/empresa/resumen', () => {
  test('arma contadores y alertas', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ razon_social: 'Constructora Andes SpA', nombre: 'Andes', nombre_fantasia: 'Andes' }] })
      .mockResolvedValueOnce({ rows: [{ estado: 'APROBADO', total: 3 }, { estado: 'RECHAZADO', total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ total: 4 }] })
      .mockResolvedValueOnce({ rows: [{ trabajadores_activos: 12, vehiculos_activos: 5, contratos_por_vencer: 2, epp_por_vencer: 1 }] });

    const res = await request(app).get('/api/empresa/resumen').set(auth(logistica()));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      empresa: { razon_social: 'Constructora Andes SpA', nombre_fantasia: 'Andes' },
      contadores: {
        por_estado: { APROBADO: 3, RECHAZADO: 1 },
        multas_pendientes: 4,
        trabajadores_activos: 12,
        vehiculos_activos: 5,
      },
      alertas: { contratos_por_vencer: 2, epp_por_vencer: 1, multas_pendientes: 4 },
    });
    pool.query.mock.calls.forEach(([, params]) => expect(params[0]).toBe('empresa-A'));
  });

  test('si la empresa no tiene razón social usa su nombre', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ razon_social: null, nombre: 'Transportes Sur', nombre_fantasia: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [{ trabajadores_activos: 0, vehiculos_activos: 0, contratos_por_vencer: 0, epp_por_vencer: 0 }] });
    const res = await request(app).get('/api/empresa/resumen').set(auth(logistica()));
    expect(res.body.empresa).toEqual({ razon_social: 'Transportes Sur', nombre_fantasia: null });
  });
});

describe('GET /api/empresa/estadisticas', () => {
  const respuestas = () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ periodo: '2026-09-01', total: 5, aprobadas: 4, rechazadas: 1, finalizadas: 3 }] })
      .mockResolvedValueOnce({ rows: [{ estado: 'FINALIZADO', total: 3 }] })
      .mockResolvedValueOnce({ rows: [{ nivel: 'BAJO', total: 2 }, { nivel: 'ALTO', total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ periodo: '2026-09-01', total: 2 }] })
      .mockResolvedValueOnce({ rows: [{ horas: '3.50' }] });
  };

  test('devuelve las series para los gráficos y el tiempo promedio como número', async () => {
    respuestas();

    const res = await request(app)
      .get('/api/empresa/estadisticas?desde=2026-07-01&hasta=2026-10-01&agrupar=semana')
      .set(auth(logistica()));

    expect(res.status).toBe(200);
    expect(res.body.por_periodo).toEqual([{ periodo: '2026-09-01', total: 5, aprobadas: 4, rechazadas: 1, finalizadas: 3 }]);
    expect(res.body.por_estado).toEqual([{ estado: 'FINALIZADO', total: 3 }]);
    expect(res.body.por_riesgo).toEqual([{ nivel: 'Bajo', total: 2 }, { nivel: 'Alto', total: 1 }]);
    expect(res.body.multas_por_periodo).toEqual([{ periodo: '2026-09-01', total: 2 }]);
    expect(res.body.tiempo_promedio_aprobacion_horas).toBe(3.5);
    expect(res.body.rango.agrupar).toBe('semana');
    expect(pool.query.mock.calls[0][1][1]).toBe('week');
  });

  test('agrupa por mes por defecto y el tiempo promedio es null si no hay aprobaciones', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ horas: null }] });

    const res = await request(app).get('/api/empresa/estadisticas').set(auth(logistica()));

    expect(res.status).toBe(200);
    expect(pool.query.mock.calls[0][1][1]).toBe('month');
    expect(res.body.tiempo_promedio_aprobacion_horas).toBeNull();
  });

  test.each([
    ['agrupar=dia', /mes o semana/],
    ['desde=abc', /desde/],
    ['hasta=abc', /hasta/],
    ['desde=2026-03-01&hasta=2026-02-01', /posterior/],
    ['desde=2024-01-01&hasta=2026-02-01', /máximo/],
  ])('400 con %s (rango máximo de 1 año, fechas ISO)', async (query, mensaje) => {
    const res = await request(app).get(`/api/empresa/estadisticas?${query}`).set(auth(logistica()));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(mensaje);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('todas las consultas se limitan a la empresa del usuario', async () => {
    respuestas();
    await request(app).get('/api/empresa/estadisticas').set(auth(logistica('empresa-Z')));
    pool.query.mock.calls.forEach(([, params]) => expect(params[0]).toBe('empresa-Z'));
  });
});
