jest.mock('../../src/config/db', () => ({ query: jest.fn() }));
jest.mock('../../src/services/bitacoraService', () => ({
  registrarEvento: jest.fn().mockResolvedValue({ id: 'ev-1' }),
  listarPorPermiso: jest.fn().mockResolvedValue([{ id: 'ev-1', tipo_evento: 'CAMBIO_ESTADO_PERMISO' }]),
}));

const pool = require('../../src/config/db');
const bitacoraService = require('../../src/services/bitacoraService');
const { detalle, rechazar, finalizar, aprobar, activar } = require('../../src/controllers/permisoController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  pool.query.mockReset();
  bitacoraService.registrarEvento.mockClear();
  bitacoraService.listarPorPermiso.mockClear();
});

describe('permisoController.detalle', () => {
  test('404 si el permiso no existe', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const req = { params: { id: 'x' }, usuario: { sub: 'chofer-1', rol: 'CHOFER', comuna_id: null } };
    const res = mockRes();

    await detalle(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('403 si no es dueño ni municipal de la misma comuna', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'p1', usuario_id: 'otro', comuna_id: 'comuna-1' }] });
    const req = { params: { id: 'p1' }, usuario: { sub: 'chofer-1', rol: 'CHOFER', comuna_id: null } };
    const res = mockRes();

    await detalle(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('200 devuelve foto, vehículo, personal, adicionales y línea de tiempo', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'p1', usuario_id: 'chofer-1', comuna_id: 'comuna-1', foto_evidencia_url: 'https://x/foto.jpg',
          nivel_riesgo: 'ALTO', score_riesgo: 80,
          vehiculo_patente: 'ABCD12', vehiculo_alto_m: 4, vehiculo_ancho_m: 2.5, vehiculo_largo_m: 10, vehiculo_peso_ton: 15,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'pf-1', rut: '11111111-1', nombre: 'Juan', contrato_vigente: true, epp_al_dia: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'veh-2', patente: 'ZZZZ99' }] });

    const req = { params: { id: 'p1' }, usuario: { sub: 'chofer-1', rol: 'CHOFER', comuna_id: null } };
    const res = mockRes();

    await detalle(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.foto_evidencia_url).toBe('https://x/foto.jpg');
    expect(body.riesgo).toEqual({ nivel: 'Alto', score: 80 });
    expect(body.vehiculo).toEqual({ patente: 'ABCD12', alto_m: 4, ancho_m: 2.5, largo_m: 10, peso_ton: 15 });
    expect(body.personal).toEqual([{ id: 'pf-1', rut: '11111111-1', nombre: 'Juan', contrato_vigente: true, epp_al_dia: true }]);
    expect(body.vehiculos_adicionales).toEqual([{ id: 'veh-2', patente: 'ZZZZ99' }]);
    expect(body.linea_tiempo).toEqual([{ id: 'ev-1', tipo_evento: 'CAMBIO_ESTADO_PERMISO' }]);
    expect(body.nivel_riesgo).toBeUndefined();
    expect(body.vehiculo_patente).toBeUndefined();
  });
});

describe('permisoController.rechazar', () => {
  test('400 si falta motivo', async () => {
    const req = { params: { id: 'p1' }, body: {}, usuario: { sub: 'op-1', comuna_id: 'comuna-1' } };
    const res = mockRes();

    await rechazar(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('409 si el permiso ya no puede rechazarse', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const req = { params: { id: 'p1' }, body: { motivo: 'datos incompletos' }, usuario: { sub: 'op-1', comuna_id: 'comuna-1' } };
    const res = mockRes();

    await rechazar(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('200 rechaza y registra en bitácora con accion RECHAZAR', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'p1', estado: 'RECHAZADO', comuna_id: 'comuna-1' }] });
    const req = { params: { id: 'p1' }, body: { motivo: 'datos incompletos' }, usuario: { sub: 'op-1', comuna_id: 'comuna-1' } };
    const res = mockRes();

    await rechazar(req, res);

    expect(res.json).toHaveBeenCalledWith({ id: 'p1', estado: 'RECHAZADO' });
    expect(bitacoraService.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({ tipoEvento: 'RECHAZO_PERMISO', accion: 'RECHAZAR', actorId: 'op-1' })
    );
  });
});

describe('permisoController.finalizar', () => {
  test('409 si el permiso no es del chofer o no está en un estado finalizable', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const req = { params: { id: 'p1' }, usuario: { sub: 'chofer-1' } };
    const res = mockRes();

    await finalizar(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('200 finaliza y registra en bitácora', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'p1', estado: 'FINALIZADO', comuna_id: 'comuna-1' }] });
    const req = { params: { id: 'p1' }, usuario: { sub: 'chofer-1' } };
    const res = mockRes();

    await finalizar(req, res);

    expect(res.json).toHaveBeenCalledWith({ id: 'p1', estado: 'FINALIZADO' });
    expect(bitacoraService.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({ tipoEvento: 'FINALIZACION_PERMISO', actorId: 'chofer-1' })
    );
  });
});

describe('permisoController.aprobar / activar registran bitácora con actor', () => {
  test('aprobar registra APROBACION_PERMISO', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'p1', estado: 'APROBADO', comuna_id: 'comuna-1' }] });
    const req = { params: { id: 'p1' }, usuario: { sub: 'op-1', comuna_id: 'comuna-1' } };
    const res = mockRes();

    await aprobar(req, res);

    expect(res.json).toHaveBeenCalledWith({ id: 'p1', estado: 'APROBADO' });
    expect(bitacoraService.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({ tipoEvento: 'APROBACION_PERMISO', actorId: 'op-1' })
    );
  });

  test('activar registra ACTIVACION_PERMISO', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'p1', estado: 'ACTIVO', geofencing_confirmado_at: '2026-01-01', comuna_id: 'comuna-1' }] });
    const req = { params: { id: 'p1' }, body: { foto_evidencia_url: 'https://x/foto.jpg' }, usuario: { sub: 'chofer-1' } };
    const res = mockRes();

    await activar(req, res);

    expect(res.json).toHaveBeenCalledWith({ id: 'p1', estado: 'ACTIVO', geofencing_confirmado_at: '2026-01-01' });
    expect(bitacoraService.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({ tipoEvento: 'ACTIVACION_PERMISO', actorId: 'chofer-1' })
    );
  });
});
