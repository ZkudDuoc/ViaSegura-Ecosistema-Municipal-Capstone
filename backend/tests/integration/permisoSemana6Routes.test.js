jest.mock('../../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../src/services/riskService', () => ({
  evaluarRiesgo: jest.fn(),
  obtenerCallesRiesgo: jest.fn(),
  obtenerZonasRojas: jest.fn(),
  obtenerRanking: jest.fn(),
}));

const request = require('supertest');
const pool = require('../../src/config/db');
const riskService = require('../../src/services/riskService');
const app = require('../../src/app');
const { tokenChofer, tokenMunicipal } = require('../testUtils');

const ID = '3f2b8c1e-9d4a-4c7e-8b1a-2d5e6f7a8b9c';
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const operador = (comuna_id = 'comuna-1') => auth(tokenMunicipal({ id: 'op-1', comuna_id }));
const logistica = (empresa_id = 'empresa-A') => auth(tokenChofer({ id: 'logistica-1', empresa_id, rol: 'LOGISTICA' }));
const chofer = () => auth(tokenChofer({ id: 'chofer-1', empresa_id: 'empresa-A', rol: 'CHOFER' }));

function conSocketFalso() {
  const io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
  app.set('io', io);
  return io;
}

beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
  riskService.evaluarRiesgo.mockReset();
  app.set('io', undefined);
});

describe('PATCH /api/permisos/:id/solicitar-revision (aplazar horario)', () => {
  test('403 para cuentas de empresa', async () => {
    const res = await request(app).patch(`/api/permisos/${ID}/solicitar-revision`).set(logistica()).send({ motivo: 'x' });
    expect(res.status).toBe(403);
  });

  test('400 sin motivo, con id inválido o con una ventana propuesta incoherente', async () => {
    expect((await request(app).patch(`/api/permisos/${ID}/solicitar-revision`).set(operador()).send({})).status).toBe(400);
    expect((await request(app).patch('/api/permisos/123/solicitar-revision').set(operador()).send({ motivo: 'x' })).status).toBe(400);
    const ventana = await request(app)
      .patch(`/api/permisos/${ID}/solicitar-revision`)
      .set(operador())
      .send({ motivo: 'Aplazar', ventana_propuesta: { inicio: '2026-11-02T10:00:00Z', fin: '2026-11-02T08:00:00Z' } });
    expect(ventana.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('409 si la solicitud no está pendiente ni aprobada a futuro', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).patch(`/api/permisos/${ID}/solicitar-revision`).set(operador()).send({ motivo: 'Aplazar' });
    expect(res.status).toBe(409);
  });

  test('200: pasa a EN_REVISION, registra en bitácora y avisa a la empresa en vivo', async () => {
    const io = conSocketFalso();
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: ID, estado: 'EN_REVISION', comuna_id: 'comuna-1', usuario_id: 'chofer-1', empresa_id: 'empresa-A' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ev-1' }] });

    const res = await request(app)
      .patch(`/api/permisos/${ID}/solicitar-revision`)
      .set(operador())
      .send({ motivo: '  Aplazar por evento masivo  ', ventana_propuesta: { inicio: '2026-11-02T10:00:00Z', fin: '2026-11-02T18:00:00Z' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: ID,
      estado: 'EN_REVISION',
      motivo: 'Aplazar por evento masivo',
      ventana_propuesta: { inicio: '2026-11-02T10:00:00Z', fin: '2026-11-02T18:00:00Z' },
    });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/estado = 'PENDIENTE_CONFIRMACION_MUNICIPAL' OR \(estado = 'APROBADO' AND ventana_inicio > now\(\)\)/);
    expect(params[0]).toBe('Aplazar por evento masivo');
    expect(params[4]).toBe('comuna-1');

    const bitacora = pool.query.mock.calls[1];
    expect(bitacora[1][2]).toBe('SOLICITUD_REVISION');

    expect(io.to).toHaveBeenCalledTimes(1);
    expect(io.to).toHaveBeenCalledWith(expect.arrayContaining(['comuna:comuna-1', 'empresa:empresa-A', 'usuario:chofer-1', `permiso:${ID}`]));
    expect(io.emit).toHaveBeenCalledWith('solicitud:en_revision', expect.objectContaining({ id: ID, motivo: 'Aplazar por evento masivo' }));
  });
});

describe('PATCH /api/permisos/:id/corregir', () => {
  const corregida = { id: ID, estado: 'PENDIENTE_CONFIRMACION_MUNICIPAL', comuna_id: 'comuna-1', usuario_id: 'logistica-1', empresa_id: 'empresa-A', ventana_inicio: '2026-11-02T10:00:00Z', ventana_fin: '2026-11-02T18:00:00Z' };

  test('403 para roles municipales', async () => {
    expect((await request(app).patch(`/api/permisos/${ID}/corregir`).set(operador()).send({})).status).toBe(403);
  });

  test('400 con ventana inválida o incompleta', async () => {
    const incompleta = await request(app).patch(`/api/permisos/${ID}/corregir`).set(logistica()).send({ ventana_inicio: '2026-11-02T10:00:00Z' });
    expect(incompleta.status).toBe(400);
    const invertida = await request(app)
      .patch(`/api/permisos/${ID}/corregir`)
      .set(logistica())
      .send({ ventana_inicio: '2026-11-02T18:00:00Z', ventana_fin: '2026-11-02T10:00:00Z' });
    expect(invertida.status).toBe(400);
  });

  test('409 si no está en revisión o no es de su empresa', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .patch(`/api/permisos/${ID}/corregir`)
      .set(logistica())
      .send({ ventana_inicio: '2026-11-02T10:00:00Z', ventana_fin: '2026-11-02T18:00:00Z' });
    expect(res.status).toBe(409);
  });

  test('409 con mensaje claro si el nuevo horario se solapa (23P01), sin filtrar detalles de Postgres', async () => {
    pool.query.mockRejectedValue(
      Object.assign(new Error('conflicting key value violates exclusion constraint "permiso_no_solape"'), { code: '23P01' })
    );
    const res = await request(app)
      .patch(`/api/permisos/${ID}/corregir`)
      .set(logistica())
      .send({ ventana_inicio: '2026-11-02T10:00:00Z', ventana_fin: '2026-11-02T18:00:00Z' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/se solapa/);
    expect(JSON.stringify(res.body)).not.toMatch(/permiso_no_solape/);
  });

  test('200: cambia la ventana, vuelve a PENDIENTE y avisa a la municipalidad', async () => {
    const io = conSocketFalso();
    pool.query.mockResolvedValueOnce({ rows: [corregida] }).mockResolvedValueOnce({ rows: [{ id: 'ev' }] });

    const res = await request(app)
      .patch(`/api/permisos/${ID}/corregir`)
      .set(logistica())
      .send({ ventana_inicio: '2026-11-02T10:00:00Z', ventana_fin: '2026-11-02T18:00:00Z' });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('PENDIENTE_CONFIRMACION_MUNICIPAL');

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/SET estado = 'PENDIENTE_CONFIRMACION_MUNICIPAL'/);
    expect(sql).toMatch(/revision_motivo = NULL/);
    expect(sql).toMatch(/estado = 'EN_REVISION'/);
    expect(sql).toMatch(/usuario_id = \$2 OR \(empresa_id = \$3::uuid AND \$4::text = 'LOGISTICA'\)/);
    expect(params.slice(0, 4)).toEqual([ID, 'logistica-1', 'empresa-A', 'LOGISTICA']);
    expect(pool.query.mock.calls[1][1][2]).toBe('CORRECCION_PERMISO');
    expect(io.emit).toHaveBeenCalledWith('solicitud:corregida', expect.objectContaining({ id: ID }));
  });

  test('un CHOFER (no administrador) solo puede corregir lo que él creó', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    await request(app).patch(`/api/permisos/${ID}/corregir`).set(chofer()).send({});
    expect(pool.query.mock.calls[0][1].slice(0, 4)).toEqual([ID, 'chofer-1', 'empresa-A', 'CHOFER']);
  });

  test('403 si cambia el camión por uno que no es de su empresa', async () => {
    pool.query.mockResolvedValue({ rows: [] }); // validación de pertenencia del vehículo
    const res = await request(app).patch(`/api/permisos/${ID}/corregir`).set(logistica()).send({ vehiculo_id: ID });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/permisos/:id/aprobar con comentario', () => {
  test('el comentario queda en la bitácora junto al actor', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: ID, estado: 'APROBADO', comuna_id: 'comuna-1', usuario_id: 'u', empresa_id: 'e' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ev' }] });

    const res = await request(app).patch(`/api/permisos/${ID}/aprobar`).set(operador()).send({ comentario: '  Aprobado con escolta  ' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: ID, estado: 'APROBADO' });
    const params = pool.query.mock.calls[1][1];
    expect(params[2]).toBe('APROBACION_PERMISO');
    expect(params[4]).toEqual({ comentario: 'Aprobado con escolta' });
    expect(params[5]).toBe('op-1');
  });

  test('sin comentario sigue funcionando igual', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: ID, estado: 'APROBADO', comuna_id: 'comuna-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ev' }] });
    const res = await request(app).patch(`/api/permisos/${ID}/aprobar`).set(operador());
    expect(res.status).toBe(200);
    expect(pool.query.mock.calls[1][1][4]).toBeNull();
  });
});

describe('PATCH /api/permisos/:id/reevaluar-riesgo', () => {
  const permiso = { id: ID, estado: 'PENDIENTE_CONFIRMACION_MUNICIPAL', comuna_id: 'comuna-1', tipo_actividad: 'PROGRAMADA', ventana_inicio: '2026-07-01T02:30:00Z', poligono: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] } };

  test('403 para cuentas de empresa y 404 si el permiso no es de la comuna', async () => {
    expect((await request(app).patch(`/api/permisos/${ID}/reevaluar-riesgo`).set(logistica())).status).toBe(403);
    pool.query.mockResolvedValue({ rows: [] });
    expect((await request(app).patch(`/api/permisos/${ID}/reevaluar-riesgo`).set(operador())).status).toBe(404);
  });

  test('503 claro si el servicio de riesgo sigue caído', async () => {
    pool.query.mockResolvedValueOnce({ rows: [permiso] });
    riskService.evaluarRiesgo.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app).patch(`/api/permisos/${ID}/reevaluar-riesgo`).set(operador());
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/servicio de riesgo/i);
  });

  test('200: evalúa con la hora local de Chile, limpia riesgo_pendiente y deja bitácora', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [permiso] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }) // INSERT evaluacion_riesgo
      .mockResolvedValueOnce({ rows: [] }) // UPDATE riesgo_pendiente
      .mockResolvedValueOnce({ rows: [{ id: 'ev' }] }); // bitácora
    riskService.evaluarRiesgo.mockResolvedValue({
      risk_score: 22.5, congestion_score: 10, nivel: 'bajo', explicacion: { resumen: 'Zona tranquila' }, comuna_detectada: 'SANTIAGO', fuente_congestion: 'SECTRA',
    });

    const res = await request(app).patch(`/api/permisos/${ID}/reevaluar-riesgo`).set(operador());

    expect(res.status).toBe(200);
    expect(res.body.riesgo_pendiente).toBe(false);
    expect(res.body.riesgo).toEqual({
      nivel: 'Bajo', score: 22.5, congestion: 10, explicacion: 'Zona tranquila', comuna_detectada: 'SANTIAGO', fuente_congestion: 'SECTRA',
    });
    // 02:30 UTC de julio = 22:30 del día anterior en Santiago (UTC-4).
    expect(riskService.evaluarRiesgo).toHaveBeenCalledWith(expect.objectContaining({ fecha: '2026-06-30', hora_inicio: 22, tipo_actividad: 'PROGRAMADA' }));
    expect(pool.query.mock.calls[2][0]).toMatch(/riesgo_pendiente = false/);
  });

  test('una reevaluación ALTA de un permiso pendiente lo manda a la cola de espera', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [permiso] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ estado: 'EN_COLA_ESPERA' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'ev' }] });
    riskService.evaluarRiesgo.mockResolvedValue({ risk_score: 90, congestion_score: 50, nivel: 'alto' });

    const res = await request(app).patch(`/api/permisos/${ID}/reevaluar-riesgo`).set(operador());

    expect(res.body.estado).toBe('EN_COLA_ESPERA');
    expect(res.body.riesgo.explicacion).toBeNull();
  });
});

describe('POST /api/permisos (crear) — Semana 6', () => {
  const VEHICULO = '11111111-2222-4333-8444-555555555555';
  const TRAB_1 = '66666666-7777-4888-8999-aaaaaaaaaaaa';
  const base = {
    rut_ejecutor: '11111111-1',
    comuna_id: ID,
    tipo_actividad: 'PROGRAMADA',
    area: [[-70.65, -33.45], [-70.65, -33.44], [-70.64, -33.44]],
    ventana_inicio: '2026-11-02T10:00:00Z',
    ventana_fin: '2026-11-02T18:00:00Z',
  };
  const permisoCreado = { id: 'permiso-1', usuario_id: 'logistica-1', comuna_id: ID, estado: 'PENDIENTE_CONFIRMACION_MUNICIPAL', ventana_fin: '2026-11-02T18:00:00Z' };

  let cliente;
  let consultas;

  // Simula las consultas de la transacción y de la evaluación de riesgo.
  function prepararBase({ vehiculosEncontrados, trabajadoresCopiados = [] } = {}) {
    consultas = [];
    const responder = (text, params = []) => {
      consultas.push(text.trim().split('\n')[0].trim());
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] };
      if (text.includes('FROM vehiculo') && text.includes('ANY($1::uuid[])')) {
        return { rows: (vehiculosEncontrados ?? params[0]).map((id) => ({ id })) };
      }
      if (text.includes('fn_crear_permiso')) return { rows: [permisoCreado] };
      if (text.includes('UPDATE permiso SET vehiculo_id')) return { rows: [{ ...permisoCreado, vehiculo_id: params[0] }] };
      if (text.includes('INSERT INTO personal_faena') && text.includes('FROM trabajador')) return { rows: trabajadoresCopiados };
      if (text.includes('INSERT INTO permiso_vehiculo') || text.includes('INSERT INTO personal_faena')) return { rows: [] };
      if (text.includes('INSERT INTO evaluacion_riesgo')) return { rows: [] };
      if (text.includes('riesgo_pendiente = true')) return { rows: [] };
      throw new Error(`Query no esperada: ${text}`);
    };
    pool.query.mockImplementation(async (text, params) => responder(text, params));
    cliente = { query: jest.fn(async (text, params) => responder(text, params)), release: jest.fn() };
    pool.connect.mockResolvedValue(cliente);
  }

  const riesgoBajo = { risk_score: 10, congestion_score: 5, nivel: 'bajo', explicacion: { resumen: 'Zona tranquila' } };

  test('400 con ventana inválida o identificadores que no son UUID, sin abrir transacción', async () => {
    prepararBase();
    const fechaMala = await request(app).post('/api/permisos').set(logistica()).send({ ...base, ventana_inicio: 'mañana' });
    expect(fechaMala.status).toBe(400);
    const invertida = await request(app).post('/api/permisos').set(logistica()).send({ ...base, ventana_fin: '2026-11-02T09:00:00Z' });
    expect(invertida.status).toBe(400);
    const idMalo = await request(app).post('/api/permisos').set(logistica()).send({ ...base, trabajadores_ids: ['no-es-uuid'] });
    expect(idMalo.status).toBe(400);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('403 y ROLLBACK si el camión no es de la empresa: no queda ningún permiso creado', async () => {
    prepararBase({ vehiculosEncontrados: [] });

    const res = await request(app).post('/api/permisos').set(logistica()).send({ ...base, vehiculo_id: VEHICULO });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/vehículos/);
    expect(consultas).toContain('BEGIN');
    expect(consultas).toContain('ROLLBACK');
    expect(consultas).not.toContain('COMMIT');
    expect(consultas.some((c) => c.includes('fn_crear_permiso') || c.includes('SELECT * FROM fn_crear_permiso'))).toBe(false);
    expect(cliente.release).toHaveBeenCalledTimes(1);
  });

  test('403 y ROLLBACK si algún trabajador no es de la nómina de la empresa', async () => {
    prepararBase({ trabajadoresCopiados: [] }); // se pidió 1, la nómina de su empresa devuelve 0

    const res = await request(app).post('/api/permisos').set(logistica()).send({ ...base, trabajadores_ids: [TRAB_1] });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/trabajadores/);
    expect(consultas).toContain('ROLLBACK');
    expect(consultas).not.toContain('COMMIT');
    expect(cliente.release).toHaveBeenCalledTimes(1);
  });

  test('201 copia la nómina como foto del momento y advierte contratos/EPP vencidos sin bloquear', async () => {
    prepararBase({
      trabajadoresCopiados: [{ rut: '12345678-5', nombre: 'Juan', contrato_vigente: false, epp_al_dia: true }],
    });
    riskService.evaluarRiesgo.mockResolvedValue(riesgoBajo);

    const res = await request(app)
      .post('/api/permisos')
      .set(logistica('empresa-A'))
      .send({ ...base, vehiculo_id: VEHICULO, trabajadores_ids: [TRAB_1, TRAB_1] });

    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('PENDIENTE_CONFIRMACION_MUNICIPAL');
    expect(res.body.advertencias).toEqual([{ tipo: 'CONTRATO_VENCIDO', rut: '12345678-5', nombre: 'Juan' }]);
    expect(res.body.riesgo).toEqual(expect.objectContaining({ nivel: 'Bajo', explicacion: 'Zona tranquila' }));
    expect(res.body.riesgo_pendiente).toBe(false);

    expect(consultas).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']));
    expect(consultas).not.toContain('ROLLBACK');

    // La copia se hace desde la nómina de SU empresa, con la fecha de fin de la ventana (hora de Chile).
    const copia = cliente.query.mock.calls.find(([text]) => text.includes('FROM trabajador'));
    expect(copia[1]).toEqual(['permiso-1', [TRAB_1], '2026-11-02', 'empresa-A']);
    expect(copia[0]).toMatch(/t\.empresa_id = \$4 AND t\.activo = true/);
  });

  test('evalúa el riesgo con fecha y HORA locales de Chile (activa el peso nocturno)', async () => {
    prepararBase();
    riskService.evaluarRiesgo.mockResolvedValue(riesgoBajo);

    await request(app)
      .post('/api/permisos')
      .set(logistica())
      .send({ ...base, ventana_inicio: '2026-07-01T02:30:00Z', ventana_fin: '2026-07-01T09:00:00Z' });

    expect(riskService.evaluarRiesgo).toHaveBeenCalledWith(
      expect.objectContaining({ fecha: '2026-06-30', hora_inicio: 22, tipo_actividad: 'PROGRAMADA' })
    );
  });

  test('si el servicio de riesgo está caído el permiso se crea igual y queda con riesgo pendiente', async () => {
    prepararBase();
    riskService.evaluarRiesgo.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(app).post('/api/permisos').set(logistica()).send(base);

    expect(res.status).toBe(201);
    expect(res.body.riesgo).toBeNull();
    expect(res.body.riesgo_pendiente).toBe(true);
    expect(consultas).toContain('COMMIT');
    expect(pool.query.mock.calls.some(([text]) => text.includes('riesgo_pendiente = true'))).toBe(true);
  });

  test('riesgo ALTO manda la solicitud a la cola de espera (respuesta y estado coherentes)', async () => {
    prepararBase();
    pool.query.mockImplementation(async (text, params) => {
      if (text.includes("SET estado = 'EN_COLA_ESPERA'")) return { rows: [{ estado: 'EN_COLA_ESPERA' }] };
      if (text.includes('INSERT INTO evaluacion_riesgo')) return { rows: [] };
      throw new Error(`Query no esperada: ${text} ${params}`);
    });
    riskService.evaluarRiesgo.mockResolvedValue({ risk_score: 90, congestion_score: 60, nivel: 'alto' });

    const res = await request(app).post('/api/permisos').set(logistica()).send(base);

    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('EN_COLA_ESPERA');
  });

  test('emite solicitud:nueva a la comuna y a la empresa', async () => {
    const io = conSocketFalso();
    prepararBase();
    riskService.evaluarRiesgo.mockResolvedValue(riesgoBajo);

    await request(app).post('/api/permisos').set(logistica()).send(base);

    expect(io.emit).toHaveBeenCalledWith('solicitud:nueva', expect.objectContaining({ id: 'permiso-1' }));
    expect(io.to).toHaveBeenCalledWith(expect.arrayContaining([`comuna:${ID}`]));
  });
});

describe('GET /api/permisos (listado)', () => {
  test('incluye la patente del camión y si el riesgo está pendiente', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: ID, patente: 'ABCD12', vehiculo_patente: 'ABCD12', nivel_riesgo: 'MEDIO', riesgo_pendiente: false }] });
    const res = await request(app).get('/api/permisos').set(operador());
    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual(expect.objectContaining({ patente: 'ABCD12', riesgo: 'Medio', riesgo_pendiente: false }));
    expect(pool.query.mock.calls[0][0]).toMatch(/LEFT JOIN vehiculo v ON v\.id = p\.vehiculo_id/);
  });
});

describe('GET /api/permisos/:id (detalle) — riesgo con explicación y advertencias', () => {
  test('expone explicación, comuna, fuente de congestión, calles afectadas y advertencias del personal', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: ID, usuario_id: 'chofer-1', comuna_id: 'comuna-1', riesgo_pendiente: false,
          nivel_riesgo: 'ALTO', score_riesgo: 81,
          detalle_riesgo: {
            explicacion: { resumen: 'Alta congestión en horario punta' },
            comuna_detectada: 'SANTIAGO',
            fuente_congestion: 'SECTRA',
            calles_afectadas: [{ nombre: 'Alameda', risk_score: 70, congestion_score: 88 }],
          },
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'pf-1', rut: '12345678-5', nombre: 'Juan', cargo: 'Operador', contrato_vigente: true, epp_al_dia: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/api/permisos/${ID}`).set(auth(tokenChofer({ id: 'chofer-1' })));

    expect(res.status).toBe(200);
    expect(res.body.riesgo).toEqual({
      nivel: 'Alto',
      score: 81,
      explicacion: 'Alta congestión en horario punta',
      comuna_detectada: 'SANTIAGO',
      fuente_congestion: 'SECTRA',
      calles_afectadas: [{ nombre: 'Alameda', risk_score: 70, congestion_score: 88 }],
    });
    expect(res.body.advertencias).toEqual([{ tipo: 'EPP_VENCIDO', rut: '12345678-5', nombre: 'Juan' }]);
    expect(res.body.riesgo_pendiente).toBe(false);
    expect(res.body.detalle_riesgo).toBeUndefined();
  });

  test('sin evaluación: riesgo null y riesgo_pendiente visible para reintentar', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: ID, usuario_id: 'chofer-1', comuna_id: 'comuna-1', riesgo_pendiente: true }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get(`/api/permisos/${ID}`).set(auth(tokenChofer({ id: 'chofer-1' })));
    expect(res.body.riesgo).toBeNull();
    expect(res.body.riesgo_pendiente).toBe(true);
  });
});
