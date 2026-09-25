jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const pool = require('../../src/config/db');
const { crear, listar } = require('../../src/controllers/vehiculoController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('vehiculoController.crear', () => {
  beforeEach(() => pool.query.mockReset());

  test('400 si faltan campos', async () => {
    const req = { body: { patente: 'ABCD12' }, usuario: { empresa_id: 'empresa-1', sub: 'chofer-1' } };
    const res = mockRes();

    await crear(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('liga el vehículo a la empresa si el usuario tiene empresa_id', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'vehiculo-1', patente: 'ABCD12', empresa_id: 'empresa-1', usuario_id: null }] });
    const req = {
      body: { patente: 'ABCD12', alto_m: 4, ancho_m: 2.5, largo_m: 10, peso_ton: 15 },
      usuario: { empresa_id: 'empresa-1', sub: 'chofer-1' },
    };
    const res = mockRes();

    await crear(req, res);

    expect(pool.query.mock.calls[0][1]).toEqual(['ABCD12', 4, 2.5, 10, 15, 'empresa-1', null]);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('liga el vehículo al usuario (persona natural) si no tiene empresa_id', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'vehiculo-1', patente: 'ABCD12', empresa_id: null, usuario_id: 'chofer-1' }] });
    const req = {
      body: { patente: 'ABCD12', alto_m: 4, ancho_m: 2.5, largo_m: 10, peso_ton: 15 },
      usuario: { empresa_id: null, sub: 'chofer-1' },
    };
    const res = mockRes();

    await crear(req, res);

    expect(pool.query.mock.calls[0][1]).toEqual(['ABCD12', 4, 2.5, 10, 15, null, 'chofer-1']);
  });
});

describe('vehiculoController.listar', () => {
  beforeEach(() => pool.query.mockReset());

  test('403 para roles municipales', async () => {
    const req = { usuario: { rol: 'OPERADOR_MUNICIPAL', empresa_id: null, sub: 'op-1' } };
    const res = mockRes();

    await listar(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('filtra por empresa_id cuando existe', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const req = { usuario: { rol: 'CHOFER', empresa_id: 'empresa-1', sub: 'chofer-1' } };
    const res = mockRes();

    await listar(req, res);

    expect(pool.query.mock.calls[0][1]).toEqual(['empresa-1']);
  });

  test('filtra por usuario_id (persona natural) cuando no hay empresa_id', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const req = { usuario: { rol: 'CHOFER', empresa_id: null, sub: 'chofer-1' } };
    const res = mockRes();

    await listar(req, res);

    expect(pool.query.mock.calls[0][1]).toEqual(['chofer-1']);
  });
});
