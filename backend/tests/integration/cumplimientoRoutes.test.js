jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenChofer, tokenMunicipal } = require('../testUtils');

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const logistica = (empresa_id = 'empresa-A') => auth(tokenChofer({ id: 'logistica-1', empresa_id, rol: 'LOGISTICA' }));

const trabajador = (n, extra = {}) => ({
  id: `t-${n}`,
  nombre: `Trabajador ${n}`,
  rut: '12345678-5',
  cargo: 'Operador',
  contrato_vigente_hasta: '2026-12-31',
  epp_vigente_hasta: '2026-12-31',
  ...extra,
});

// Orden de las consultas en el controller: vencidos, por vencer, multas,
// multas recientes, solicitudes, tiempo promedio.
function responder({
  vencidos = [],
  porVencer = [],
  multas = { total: 0, ultimos_30_dias: 0 },
  recientes = [],
  solicitudes = { total: 0, aprobadas: 0, rechazadas: 0 },
  horas = null,
} = {}) {
  pool.query
    .mockResolvedValueOnce({ rows: vencidos })
    .mockResolvedValueOnce({ rows: porVencer })
    .mockResolvedValueOnce({ rows: [multas] })
    .mockResolvedValueOnce({ rows: recientes })
    .mockResolvedValueOnce({ rows: [solicitudes] })
    .mockResolvedValueOnce({ rows: [{ horas }] });
}

beforeEach(() => pool.query.mockReset());

describe('GET /api/empresa/cumplimiento', () => {
  test('401 sin token y 403 para roles municipales (mismo middleware que /empresa/resumen)', async () => {
    expect((await request(app).get('/api/empresa/cumplimiento')).status).toBe(401);
    expect((await request(app).get('/api/empresa/cumplimiento').set(auth(tokenMunicipal()))).status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('403 si la cuenta no está asociada a una empresa', async () => {
    const res = await request(app)
      .get('/api/empresa/cumplimiento')
      .set(auth(tokenChofer({ empresa_id: null, rol: 'LOGISTICA' })));
    expect(res.status).toBe(403);
  });

  test('responde con la forma pactada con el frontend', async () => {
    responder({
      vencidos: [trabajador(1, { contrato_vigente_hasta: '2026-10-01' })],
      porVencer: [trabajador(2, { epp_vigente_hasta: '2026-11-20' })],
      multas: { total: 7, ultimos_30_dias: 2 },
      recientes: [{ id: 'm1', fecha: '2026-11-05T10:00:00Z', descripcion: 'Sin conos', permiso_id: 'p1' }],
      solicitudes: { total: 8, aprobadas: 6, rechazadas: 1 },
      horas: '3.50',
    });

    const res = await request(app).get('/api/empresa/cumplimiento').set(logistica());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      trabajadores: {
        vencidos: [trabajador(1, { contrato_vigente_hasta: '2026-10-01' })],
        por_vencer: [trabajador(2, { epp_vigente_hasta: '2026-11-20' })],
      },
      multas: {
        total: 7,
        ultimos_30_dias: 2,
        recientes: [{ id: 'm1', fecha: '2026-11-05T10:00:00Z', descripcion: 'Sin conos', permiso_id: 'p1' }],
      },
      solicitudes: { total: 8, aprobadas: 6, rechazadas: 1, tasa_aprobacion: 75 },
      tiempo_promedio_aprobacion_horas: 3.5,
    });
  });

  test('sin datos: listas vacías, ceros y tiempo promedio null (sin dividir por cero)', async () => {
    responder();

    const res = await request(app).get('/api/empresa/cumplimiento').set(logistica());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      trabajadores: { vencidos: [], por_vencer: [] },
      multas: { total: 0, ultimos_30_dias: 0, recientes: [] },
      solicitudes: { total: 0, aprobadas: 0, rechazadas: 0, tasa_aprobacion: 0 },
      tiempo_promedio_aprobacion_horas: null,
    });
  });

  test('tasa_aprobacion es un porcentaje 0-100 con un decimal', async () => {
    responder({ solicitudes: { total: 3, aprobadas: 1, rechazadas: 0 } });
    const res = await request(app).get('/api/empresa/cumplimiento').set(logistica());
    expect(res.body.solicitudes.tasa_aprobacion).toBe(33.3);
  });

  test('todas las consultas se limitan a la empresa del usuario (acceso cruzado imposible)', async () => {
    responder();
    await request(app).get('/api/empresa/cumplimiento').set(logistica('empresa-Z'));

    expect(pool.query).toHaveBeenCalledTimes(6);
    pool.query.mock.calls.forEach(([, params]) => expect(params).toEqual(['empresa-Z']));
  });

  test('los trabajadores consultados son solo los ACTIVOS de la empresa', async () => {
    responder();
    await request(app).get('/api/empresa/cumplimiento').set(logistica());

    const [sqlVencidos] = pool.query.mock.calls[0];
    const [sqlPorVencer] = pool.query.mock.calls[1];
    for (const sql of [sqlVencidos, sqlPorVencer]) {
      expect(sql).toMatch(/FROM trabajador/);
      expect(sql).toMatch(/empresa_id = \$1 AND activo = true/);
    }
  });

  test('vencidos = contrato o EPP anterior a hoy; por_vencer = dentro de los próximos 30 días (los ya vencidos no cuentan como por vencer)', async () => {
    responder();
    await request(app).get('/api/empresa/cumplimiento').set(logistica());

    const sqlVencidos = pool.query.mock.calls[0][0].replace(/\s+/g, ' ');
    expect(sqlVencidos).toMatch(/contrato_vigente_hasta < .*::date OR epp_vigente_hasta < .*::date/);

    const sqlPorVencer = pool.query.mock.calls[1][0].replace(/\s+/g, ' ');
    expect(sqlPorVencer).toMatch(/contrato_vigente_hasta BETWEEN .*::date AND .*::date \+ 30/);
    expect(sqlPorVencer).toMatch(/epp_vigente_hasta BETWEEN .*::date AND .*::date \+ 30/);
    // "hoy" se calcula en hora de Chile, no en la zona horaria del servidor.
    expect(sqlVencidos).toMatch(/AT TIME ZONE 'America\/Santiago'/);
  });

  test('las multas recientes son las últimas 5, y se cuentan las de los últimos 30 días', async () => {
    responder();
    await request(app).get('/api/empresa/cumplimiento').set(logistica());

    expect(pool.query.mock.calls[3][0]).toMatch(/ORDER BY i\.fecha DESC LIMIT 5/);
    expect(pool.query.mock.calls[2][0]).toMatch(/i\.fecha >= now\(\) - interval '30 days'/);
  });

  test('reutiliza la lógica de estadísticas para "aprobadas" y el tiempo promedio de aprobación', async () => {
    responder();
    await request(app).get('/api/empresa/cumplimiento').set(logistica());

    const aprobadas = pool.query.mock.calls[4][0];
    expect(aprobadas).toMatch(/he\.tipo_evento = 'CAMBIO_ESTADO_PERMISO'/);
    expect(aprobadas).toMatch(/he\.detalle->>'estado_nuevo' = 'APROBADO'/);
    expect(aprobadas).toMatch(/p\.estado = 'RECHAZADO'/);

    const tiempo = pool.query.mock.calls[5][0];
    expect(tiempo).toMatch(/min\(he\.created_at\) AS aprobado_at/);
    expect(tiempo).toMatch(/extract\(epoch FROM \(a\.aprobado_at - p\.created_at\)\) \/ 3600/);
  });

  test('sigue funcionando /empresa/estadisticas, que comparte esa lógica', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ horas: '2.00' }] });
    const res = await request(app).get('/api/empresa/estadisticas').set(logistica());
    expect(res.status).toBe(200);
    expect(res.body.tiempo_promedio_aprobacion_horas).toBe(2);
    expect(pool.query.mock.calls[4][0]).toMatch(/min\(he\.created_at\) AS aprobado_at/);
  });
});
