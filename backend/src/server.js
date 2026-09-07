require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { registrarPanicoSocket } = require('./sockets/panicoSocket');

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

registrarPanicoSocket(io);

server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
