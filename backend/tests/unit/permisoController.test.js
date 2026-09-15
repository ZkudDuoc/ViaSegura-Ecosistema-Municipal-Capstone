jest.mock('../../src/config/db', () => ({ query: jest.fn() }));
jest.mock('../../src/services/bitacoraService', () => ({
  registrarEvento: jest.fn().mockResolvedValue({ id: 'ev-1' }),
  listarPorPermiso: jest.fn().mockResolvedValue([]),
}));

const pool = require('../../src/config/db');
const bitacoraService = require('../../src/services/bitacoraService');
const { cola, revocar, asignarMovil, bitacora } = require('../../src/controllers/permisoController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('permisoController.cola', () => {
  beforeEach(() => pool.query.mockReset());

  test('filtra la cola por la comuna del operador y ordena por prioridad', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'p-1' }] });
    const req = { usuario: { comuna_id: 'comuna-1' } };
    const res = mockRes();

    await cola(req, res);

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('FROM v_cola_espera'), ['comuna-1']);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("ORDER BY (v.tipo_actividad = 'EMERGENCIA')"), [
      'comuna-1',
    ]);
    expect(res.json).toHaveBeenCalledWith([{ id: 'p-1' }]);
  });
});

describe('permisoController.revocar', () => {
  beforeEach(() => {
    pool.query.mockReset();
    bitacoraService.registrarEvento.mockClear();
  });

  test('revoca un permiso revocable y deja registro en bitácora', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 'permiso-1', estado: 'REVOCADO', revocado_por: 'op-1', revocado_at: '2026-01-01' }],
    });
    const req = {
      params: { id: 'permiso-1' },
      body: { motivo: 'incumplimiento' },
      usuario: { sub: 'op-1', comuna_id: 'comuna-1' },
    };
    const res = mockRes();

    await revocar(req, res);

    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'permiso-1', estado: 'REVOCADO' })
    );
    expect(bitacoraService.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({ permisoId: 'permiso-1', accion: 'REVOCAR', actorId: 'op-1' })
    );
  });

  test('responde 409 si el permiso ya no puede revocarse', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const req = {
      params: { id: 'permiso-1' },
      body: {},
      usuario: { sub: 'op-1', comuna_id: 'comuna-1' },
    };
    const res = mockRes();

    await revocar(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(bitacoraService.registrarEvento).not.toHaveBeenCalled();
  });
});

describe('permisoController.asignarMovil', () => {
  beforeEach(() => {
    pool.query.mockReset();
    bitacoraService.registrarEvento.mockClear();
  });

  test('responde 400 si falta identificador_movil', async () => {
    const req = { params: { id: 'permiso-1' }, body: {}, usuario: { sub: 'op-1', comuna_id: 'comuna-1' } };
    const res = mockRes();

    await asignarMovil(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('responde 404 si el permiso no existe en la comuna del operador', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const req = {
      params: { id: 'permiso-1' },
      body: { identificador_movil: 'M-01' },
      usuario: { sub: 'op-1', comuna_id: 'comuna-1' },
    };
    const res = mockRes();

    await asignarMovil(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('asigna el móvil, registra bitácora y devuelve el permiso actualizado', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'permiso-1', comuna_id: 'comuna-1', estado: 'EN_COLA_ESPERA' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'movil-1', permiso_id: 'permiso-1', identificador_movil: 'M-01' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'permiso-1', estado: 'PENDIENTE_CONFIRMACION_MUNICIPAL', motivo_cola: null }] });

    const req = {
      params: { id: 'permiso-1' },
      body: { identificador_movil: 'M-01' },
      usuario: { sub: 'op-1', comuna_id: 'comuna-1' },
    };
    const res = mockRes();

    await asignarMovil(req, res);

    expect(bitacoraService.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'ASIGNAR_SEGURIDAD' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      movil: { id: 'movil-1', permiso_id: 'permiso-1', identificador_movil: 'M-01' },
      permiso: { id: 'permiso-1', estado: 'PENDIENTE_CONFIRMACION_MUNICIPAL', motivo_cola: null },
    });
  });
});

describe('permisoController.bitacora', () => {
  beforeEach(() => {
    pool.query.mockReset();
    bitacoraService.listarPorPermiso.mockClear();
  });

  test('responde 404 si el permiso no existe', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const req = { params: { id: 'x' }, usuario: { sub: 'u-1', rol: 'CHOFER', comuna_id: null } };
    const res = mockRes();

    await bitacora(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('permite ver la bitácora al dueño del permiso', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'permiso-1', comuna_id: 'comuna-1', usuario_id: 'chofer-1' }] });
    bitacoraService.listarPorPermiso.mockResolvedValue([{ id: 'ev-1' }]);
    const req = { params: { id: 'permiso-1' }, usuario: { sub: 'chofer-1', rol: 'CHOFER', comuna_id: null } };
    const res = mockRes();

    await bitacora(req, res);

    expect(res.json).toHaveBeenCalledWith([{ id: 'ev-1' }]);
  });

  test('rechaza a un chofer que no es dueño del permiso', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'permiso-1', comuna_id: 'comuna-1', usuario_id: 'otro-chofer' }] });
    const req = { params: { id: 'permiso-1' }, usuario: { sub: 'chofer-1', rol: 'CHOFER', comuna_id: null } };
    const res = mockRes();

    await bitacora(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('permite ver la bitácora a un operador municipal de la misma comuna', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'permiso-1', comuna_id: 'comuna-1', usuario_id: 'chofer-1' }] });
    bitacoraService.listarPorPermiso.mockResolvedValue([{ id: 'ev-1' }]);
    const req = {
      params: { id: 'permiso-1' },
      usuario: { sub: 'op-1', rol: 'OPERADOR_MUNICIPAL', comuna_id: 'comuna-1' },
    };
    const res = mockRes();

    await bitacora(req, res);

    expect(res.json).toHaveBeenCalledWith([{ id: 'ev-1' }]);
  });
});
