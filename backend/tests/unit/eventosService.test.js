const { emitirEventoSolicitud, salasDeDestino } = require('../../src/services/eventosService');

function mockReqConIo() {
  const io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
  const req = { app: { get: jest.fn().mockReturnValue(io) } };
  return { req, io };
}

describe('salasDeDestino', () => {
  test('incluye comuna, dueño, empresa y la sala del permiso', () => {
    expect(salasDeDestino({ id: 'p1', comuna_id: 'c1', usuario_id: 'u1', empresa_id: 'e1' })).toEqual([
      'comuna:c1',
      'usuario:u1',
      'empresa:e1',
      'permiso:p1',
    ]);
  });

  test('omite los datos que no vienen', () => {
    expect(salasDeDestino({ id: 'p1', comuna_id: 'c1' })).toEqual(['comuna:c1', 'permiso:p1']);
    expect(salasDeDestino({})).toEqual([]);
  });
});

describe('emitirEventoSolicitud', () => {
  test('no lanza ni hace nada si no hay io registrado', () => {
    const req = { app: { get: jest.fn().mockReturnValue(undefined) } };
    expect(() => emitirEventoSolicitud(req, 'solicitud:nueva', { id: 'p1', comuna_id: 'c1', usuario_id: 'u1' })).not.toThrow();
  });

  test('no lanza si el permiso es null/undefined o si no se pasa req', () => {
    const { req } = mockReqConIo();
    expect(() => emitirEventoSolicitud(req, 'solicitud:nueva', null)).not.toThrow();
    expect(() => emitirEventoSolicitud(undefined, 'solicitud:nueva', { id: 'p1' })).not.toThrow();
  });

  test('emite UNA sola vez sobre la unión de salas (sin copias duplicadas por sala)', () => {
    const { req, io } = mockReqConIo();
    emitirEventoSolicitud(req, 'solicitud:aprobada', { id: 'p1', comuna_id: 'comuna-1', usuario_id: 'chofer-1', empresa_id: 'empresa-A' });

    expect(io.to).toHaveBeenCalledTimes(1);
    expect(io.to).toHaveBeenCalledWith(['comuna:comuna-1', 'usuario:chofer-1', 'empresa:empresa-A', 'permiso:p1']);
    expect(io.emit).toHaveBeenCalledTimes(1);
    expect(io.emit).toHaveBeenCalledWith('solicitud:aprobada', expect.objectContaining({ id: 'p1' }));
  });

  test('si no hay ninguna sala de destino no emite', () => {
    const { req, io } = mockReqConIo();
    emitirEventoSolicitud(req, 'solicitud:nueva', { estado: 'X' });
    expect(io.emit).not.toHaveBeenCalled();
  });
});
