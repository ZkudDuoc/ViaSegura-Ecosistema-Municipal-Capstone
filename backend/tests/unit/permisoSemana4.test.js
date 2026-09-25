jest.mock('../../src/config/db', () => ({ query: jest.fn() }));
jest.mock('../../src/services/bitacoraService', () => ({
  registrarEvento: jest.fn().mockResolvedValue({ id: 'ev-1' }),
}));

const pool = require('../../src/config/db');
const bitacoraService = require('../../src/services/bitacoraService');
const { validarPatente, operativo, operativos } = require('../../src/controllers/permisoController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('permisoController.validarPatente', () => {
  beforeEach(() => {
    pool.query.mockReset();
    bitacoraService.registrarEvento.mockClear();
  });

  test('400 si falta la patente', async () => {
    const req = { params: { id: 'permiso-1' }, body: {}, usuario: { comuna_id: 'comuna-1', sub: 'op-1' } };
    const res = mockRes();

    await validarPatente(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('404 si el permiso no existe en la comuna del operador', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const req = { params: { id: 'permiso-1' }, body: { patente: 'ABCD12' }, usuario: { comuna_id: 'comuna-1', sub: 'op-1' } };
    const res = mockRes();

    await validarPatente(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('409 si el permiso no tiene vehículo asociado', async () => {
    pool.query.mockResolvedValue({ rows: [{ permiso_id: 'permiso-1', comuna_id: 'comuna-1', vehiculo_id: null, patente: null }] });
    const req = { params: { id: 'permiso-1' }, body: { patente: 'ABCD12' }, usuario: { comuna_id: 'comuna-1', sub: 'op-1' } };
    const res = mockRes();

    await validarPatente(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('coincide:true cuando la patente coincide ignorando mayúsculas y guiones', async () => {
    pool.query.mockResolvedValue({ rows: [{ permiso_id: 'permiso-1', comuna_id: 'comuna-1', vehiculo_id: 'vehiculo-1', patente: 'ABCD12' }] });
    const req = { params: { id: 'permiso-1' }, body: { patente: 'abcd-12' }, usuario: { comuna_id: 'comuna-1', sub: 'op-1' } };
    const res = mockRes();

    await validarPatente(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ coincide: true }));
    expect(bitacoraService.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({ tipoEvento: 'VALIDACION_PATENTE', detalle: expect.objectContaining({ coincide: true }) })
    );
  });

  test('coincide:false cuando la patente no coincide', async () => {
    pool.query.mockResolvedValue({ rows: [{ permiso_id: 'permiso-1', comuna_id: 'comuna-1', vehiculo_id: 'vehiculo-1', patente: 'ABCD12' }] });
    const req = { params: { id: 'permiso-1' }, body: { patente: 'XYZZ99' }, usuario: { comuna_id: 'comuna-1', sub: 'op-1' } };
    const res = mockRes();

    await validarPatente(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ coincide: false }));
  });
});

describe('permisoController.operativo', () => {
  beforeEach(() => pool.query.mockReset());

  test('404 si el permiso no existe', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const req = { params: { id: 'x' }, usuario: { sub: 'chofer-1', rol: 'CHOFER', comuna_id: null } };
    const res = mockRes();

    await operativo(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('403 si no es el dueño ni un operador de la misma comuna', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 'permiso-1', comuna_id: 'comuna-1', usuario_id: 'otro-chofer', estado: 'ACTIVO', geofencing_confirmado_at: new Date().toISOString(), ventana_fin: new Date().toISOString() }],
    });
    const req = { params: { id: 'permiso-1' }, usuario: { sub: 'chofer-1', rol: 'CHOFER', comuna_id: null } };
    const res = mockRes();

    await operativo(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('409 si el permiso aún no se activó en terreno', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 'permiso-1', comuna_id: 'comuna-1', usuario_id: 'chofer-1', estado: 'APROBADO', geofencing_confirmado_at: null, ventana_fin: new Date().toISOString() }],
    });
    const req = { params: { id: 'permiso-1' }, usuario: { sub: 'chofer-1', rol: 'CHOFER', comuna_id: null } };
    const res = mockRes();

    await operativo(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('devuelve tiempos calculados para un permiso activo', async () => {
    const inicio = new Date(Date.now() - 10 * 60000);
    const fin = new Date(Date.now() + 50 * 60000);
    pool.query.mockResolvedValue({
      rows: [{ id: 'permiso-1', comuna_id: 'comuna-1', usuario_id: 'chofer-1', estado: 'ACTIVO', geofencing_confirmado_at: inicio.toISOString(), ventana_fin: fin.toISOString() }],
    });
    const req = { params: { id: 'permiso-1' }, usuario: { sub: 'chofer-1', rol: 'CHOFER', comuna_id: null } };
    const res = mockRes();

    await operativo(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.transcurrido_min).toBeCloseTo(10, 0);
    expect(body.restante_min).toBeCloseTo(50, 0);
    expect(body.vencido).toBe(false);
  });
});

describe('permisoController.operativos', () => {
  beforeEach(() => pool.query.mockReset());

  test('lista los servicios activos de la comuna con su área', async () => {
    const inicio = new Date(Date.now() - 5 * 60000);
    const fin = new Date(Date.now() + 55 * 60000);
    pool.query.mockResolvedValue({
      rows: [{
        id: 'permiso-1', comuna_id: 'comuna-1', usuario_id: 'chofer-1', estado: 'ACTIVO',
        geofencing_confirmado_at: inicio.toISOString(), ventana_fin: fin.toISOString(),
        area: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
      }],
    });
    const req = { usuario: { comuna_id: 'comuna-1' } };
    const res = mockRes();

    await operativos(req, res);

    expect(pool.query.mock.calls[0][1]).toEqual(['comuna-1']);
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveLength(1);
    expect(body[0].area).toEqual({ type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] });
  });
});
