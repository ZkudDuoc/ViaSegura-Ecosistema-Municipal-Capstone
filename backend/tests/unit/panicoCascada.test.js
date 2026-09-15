jest.mock('../../src/config/db', () => ({ query: jest.fn() }));
jest.mock('../../src/services/smsService', () => ({ enviarSMS: jest.fn() }));
jest.mock('../../src/services/bitacoraService', () => ({ registrarEvento: jest.fn().mockResolvedValue({}) }));

const pool = require('../../src/config/db');
const smsService = require('../../src/services/smsService');
const bitacoraService = require('../../src/services/bitacoraService');
const { ejecutarCascadaPanico } = require('../../src/sockets/panicoSocket');

function mockIo(roomSize) {
  const rooms = new Map();
  if (roomSize > 0) {
    rooms.set('comuna:comuna-1', new Set(Array.from({ length: roomSize }, (_, i) => `socket-${i}`)));
  }
  return {
    sockets: { adapter: { rooms } },
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };
}

const permiso = { id: 'permiso-1', comuna_id: 'comuna-1' };
const alerta = { id: 'alerta-1' };
const evento = { alertaId: 'alerta-1', permisoId: 'permiso-1', nombre: 'Juan' };

describe('ejecutarCascadaPanico', () => {
  beforeEach(() => {
    pool.query.mockReset();
    smsService.enviarSMS.mockReset();
    bitacoraService.registrarEvento.mockClear();
  });

  test('escalón 1: entrega por WebSocket si hay un operador conectado', async () => {
    const io = mockIo(1);

    await ejecutarCascadaPanico(io, { alerta, permiso, evento });

    expect(io.to).toHaveBeenCalledWith('comuna:comuna-1');
    expect(io.emit).toHaveBeenCalledWith('panico:nuevo', evento);
    expect(smsService.enviarSMS).not.toHaveBeenCalled();
    expect(bitacoraService.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({ detalle: expect.objectContaining({ canal: 'WEBSOCKET', resultado: 'ENTREGADO' }) })
    );
  });

  test('escalón 2: sin operadores conectados, intenta SMS y no encola si tiene éxito', async () => {
    const io = mockIo(0);
    pool.query.mockResolvedValueOnce({ rows: [{ telefonos_alerta: ['+56911111111'] }] });
    smsService.enviarSMS.mockResolvedValue({ enviado: true, detalle: [] });

    await ejecutarCascadaPanico(io, { alerta, permiso, evento });

    expect(smsService.enviarSMS).toHaveBeenCalledWith(['+56911111111'], expect.any(String));
    expect(pool.query).toHaveBeenCalledTimes(1); // solo el SELECT de teléfonos, sin INSERT a cola local
    expect(bitacoraService.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({ detalle: expect.objectContaining({ canal: 'SMS', resultado: 'ENTREGADO' }) })
    );
  });

  test('escalón 3: si el SMS falla, encola en panico_cola_local', async () => {
    const io = mockIo(0);
    pool.query
      .mockResolvedValueOnce({ rows: [{ telefonos_alerta: [] }] }) // SELECT teléfonos
      .mockResolvedValueOnce({ rows: [] }); // INSERT cola local
    smsService.enviarSMS.mockResolvedValue({ enviado: false, detalle: 'Sin teléfonos de alerta configurados para la comuna' });

    await ejecutarCascadaPanico(io, { alerta, permiso, evento });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO panico_cola_local'),
      ['alerta-1', 'comuna-1', evento]
    );
    expect(bitacoraService.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({ detalle: expect.objectContaining({ canal: 'COLA_LOCAL', resultado: 'ENCOLADO' }) })
    );
  });
});
