// Seguridad del pánico (Semana 5): el backend debe identificar al chofer
// por el JWT del handshake, nunca por un `usuarioId` que mande el cliente
// en el payload — si no, cualquiera podría disparar una alerta a nombre de
// otro. Se prueba con un servidor Socket.io real (no solo la cascada) para
// verificar el comportamiento completo del handler `panico:enviar`.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../../src/config/db', () => ({ query: jest.fn() }));
jest.mock('../../src/services/smsService', () => ({ enviarSMS: jest.fn().mockResolvedValue({ enviado: false }) }));
jest.mock('../../src/services/bitacoraService', () => ({ registrarEvento: jest.fn().mockResolvedValue({}) }));

const http = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const pool = require('../../src/config/db');
const { firmarToken } = require('../../src/utils/jwt');
const { registrarPanicoSocket } = require('../../src/sockets/panicoSocket');

const CHOFER_REAL = 'chofer-real';
const CHOFER_SUPLANTADO = 'chofer-suplantado';

let httpServer;
let io;
let url;

beforeAll((done) => {
  httpServer = http.createServer();
  io = new Server(httpServer);
  registrarPanicoSocket(io);
  httpServer.listen(() => {
    url = `http://localhost:${httpServer.address().port}`;
    done();
  });
});

afterAll((done) => {
  io.close();
  httpServer.close(done);
});

beforeEach(() => {
  pool.query.mockReset();
});

function conectar(token) {
  return ioClient(url, { auth: token ? { token } : undefined, transports: ['websocket'], forceNew: true });
}

test('rechaza panico:enviar si el socket no se autenticó con un JWT válido', (done) => {
  const socket = conectar(null);

  socket.on('connect', () => {
    socket.emit('panico:enviar', { ubicacion: { lat: -33.4, lng: -70.6 } });
  });

  socket.on('panico:error', (payload) => {
    expect(payload.error).toMatch(/iniciar sesión/i);
    expect(pool.query).not.toHaveBeenCalled();
    socket.disconnect();
    done();
  });
});

test('usa el usuario del JWT, ignorando un usuarioId falso en el payload (suplantación)', (done) => {
  const token = firmarToken({ id: CHOFER_REAL, rol: 'CHOFER', empresa_id: 'empresa-1', comuna_id: null });
  const socket = conectar(token);

  pool.query.mockImplementation((text, params = []) => {
    if (text.includes('FROM permiso p') && text.includes('JOIN usuario u')) {
      // El backend debe consultar por el usuario del TOKEN, no por el del payload.
      expect(params[0]).toBe(CHOFER_REAL);
      return { rows: [{ id: 'permiso-1', comuna_id: 'comuna-1', rut_ejecutor: '11111111-1', nombre: 'Chofer Real', patente: null }] };
    }
    if (text.includes('INSERT INTO alerta_panico')) {
      return { rows: [{ id: 'alerta-1', activado_at: new Date().toISOString() }] };
    }
    if (text.includes('SELECT telefonos_alerta')) {
      return { rows: [{ telefonos_alerta: [] }] };
    }
    if (text.includes('INSERT INTO panico_cola_local')) {
      return { rows: [] };
    }
    throw new Error(`Query no esperada: ${text}`);
  });

  socket.on('connect', () => {
    // Payload intenta suplantar a otro usuario — el backend debe ignorarlo.
    socket.emit('panico:enviar', { usuarioId: CHOFER_SUPLANTADO, nombre: 'Impostor', ubicacion: { lat: -33.4, lng: -70.6 } });
  });

  socket.on('panico:confirmado', () => {
    socket.disconnect();
    done();
  });

  socket.on('panico:error', (payload) => done(new Error(`No debería fallar: ${payload.error}`)));
});
