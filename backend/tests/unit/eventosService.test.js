const { emitirEventoSolicitud } = require('../../src/services/eventosService');

function mockReqConIo() {
  const io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
  const req = { app: { get: jest.fn().mockReturnValue(io)  } };
  return { req, io };
}

describe('emitirEventoSolicitud', () => {
  test('no lanza ni hace nada si no hay io registrado', () => {
    const req = { app: { get: jest.fn().mockReturnValue(undefined) } };
    expect(() => emitirEventoSolicitud(req, 'solicitud:nueva', { id: 'p1', comuna_id: 'c1', usuario_id: 'u1' })).not.toThrow();
  });

  test('no lanza si el permiso es null/undefined', () => {
    const { req } = mockReqConIo();
    expect(() => emitirEventoSolicitud(req, 'solicitud:nueva', null)).not.toThrow();
  });

  test('emite a la sala de la comuna y a la sala del usuario dueño', () => {
    const { req, io } = mockReqConIo();
    emitirEventoSolicitud(req, 'solicitud:aprobada', { id: 'p1', comuna_id: 'comuna-1', usuario_id: 'chofer-1' });

    expect(io.to).toHaveBeenCalledWith('comuna:comuna-1');
    expect(io.to).toHaveBeenCalledWith('usuario:chofer-1');
    expect(io.emit).toHaveBeenCalledWith('solicitud:aprobada', expect.objectContaining({ id: 'p1' }));
  });
});
