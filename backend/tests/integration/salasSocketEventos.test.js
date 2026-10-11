// Los eventos solicitud:* deben llegar a quien corresponde: la comuna, el
// dueño, TODA la empresa (administradores) y la sesión de código de chofer
// ligada a ese servicio — y a nadie más. Servidor Socket.io real.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../../src/config/db', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));

const http = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const { firmarToken } = require('../../src/utils/jwt');
const { registrarPanicoSocket } = require('../../src/sockets/panicoSocket');
const { emitirEventoSolicitud } = require('../../src/services/eventosService');

let httpServer;
let io;
let url;
const clientes = [];

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
  clientes.forEach((c) => c.disconnect());
  io.close();
  httpServer.close(done);
});

function conectar(token) {
  return new Promise((resolve) => {
    const socket = ioClient(url, { auth: token ? { token } : undefined, transports: ['websocket'], forceNew: true });
    clientes.push(socket);
    socket.on('connect', () => resolve(socket));
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const reqConIo = () => ({ app: { get: () => io } });

const PERMISO = { id: 'permiso-1', comuna_id: 'comuna-1', usuario_id: 'chofer-1', empresa_id: 'empresa-A' };

test('el evento llega a la comuna, al dueño, a la empresa y al código de chofer del servicio — y a nadie más', async () => {
  const operador = await conectar(firmarToken({ id: 'op-1', rol: 'OPERADOR_MUNICIPAL', empresa_id: null, comuna_id: 'comuna-1' }));
  const dueno = await conectar(firmarToken({ id: 'chofer-1', rol: 'CHOFER', empresa_id: 'empresa-A', comuna_id: null }));
  const admin = await conectar(firmarToken({ id: 'logistica-9', rol: 'LOGISTICA', empresa_id: 'empresa-A', comuna_id: null }));
  const sesionCodigo = await conectar(jwt.sign({ tipo: 'CODIGO_CHOFER', permisoId: 'permiso-1' }, process.env.JWT_SECRET));

  const otraEmpresa = await conectar(firmarToken({ id: 'logistica-7', rol: 'LOGISTICA', empresa_id: 'empresa-B', comuna_id: null }));
  const otraComuna = await conectar(firmarToken({ id: 'op-2', rol: 'OPERADOR_MUNICIPAL', empresa_id: null, comuna_id: 'comuna-2' }));
  const otroCodigo = await conectar(jwt.sign({ tipo: 'CODIGO_CHOFER', permisoId: 'permiso-OTRO' }, process.env.JWT_SECRET));
  const anonimo = await conectar(null);

  const recibidos = {};
  const escuchar = (nombre, socket) => {
    recibidos[nombre] = [];
    socket.on('solicitud:en_revision', (p) => recibidos[nombre].push(p));
  };
  Object.entries({ operador, dueno, admin, sesionCodigo, otraEmpresa, otraComuna, otroCodigo, anonimo }).forEach(([n, s]) => escuchar(n, s));

  await esperar(100); // los joins de sala son asíncronos
  emitirEventoSolicitud(reqConIo(), 'solicitud:en_revision', { ...PERMISO, motivo: 'Aplazar' });
  await esperar(200);

  for (const quien of ['operador', 'dueno', 'admin', 'sesionCodigo']) {
    expect(recibidos[quien]).toHaveLength(1);
    expect(recibidos[quien][0]).toEqual(expect.objectContaining({ id: 'permiso-1', motivo: 'Aplazar' }));
  }
  for (const quien of ['otraEmpresa', 'otraComuna', 'otroCodigo', 'anonimo']) {
    expect(recibidos[quien]).toHaveLength(0);
  }
});

test('el dueño, que está en su sala personal y en la de su empresa, recibe UNA sola copia del evento', async () => {
  const dueno = await conectar(firmarToken({ id: 'chofer-1', rol: 'CHOFER', empresa_id: 'empresa-A', comuna_id: null }));
  let veces = 0;
  dueno.on('solicitud:aprobada', () => {
    veces += 1;
  });

  await esperar(100);
  emitirEventoSolicitud(reqConIo(), 'solicitud:aprobada', PERMISO);
  await esperar(200);

  expect(veces).toBe(1);
});
