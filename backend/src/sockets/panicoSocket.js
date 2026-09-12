const pool = require('../config/db');
const { verificarToken } = require('../utils/jwt');

const ROLES_MUNICIPALES = ['OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL'];

// Contrato acordado con la app móvil (app-movil/src/services/panicoSocket.js):
//   cliente emite "panico:enviar"      -> { usuarioId, nombre, ubicacion: { lat, lng }, timestamp }
//   servidor emite "panico:confirmado" -> { recibidoEn }
//   servidor emite "panico:error"      -> { error }
function registrarPanicoSocket(io) {
  io.on('connection', (socket) => {
    const { token } = socket.handshake.auth || {};

    if (token) {
      try {
        socket.usuario = verificarToken(token);
        if (ROLES_MUNICIPALES.includes(socket.usuario.rol)) {
          socket.join(`comuna:${socket.usuario.comuna_id}`);
        }
      } catch (err) {
        // Token inválido/expirado: se acepta la conexión igual, pero sin sala de operador.
      }
    }

    socket.on('panico:enviar', async (payload) => {
      try {
        const { usuarioId, nombre, ubicacion } = payload || {};

        if (!usuarioId || !ubicacion || typeof ubicacion.lat !== 'number' || typeof ubicacion.lng !== 'number') {
          socket.emit('panico:error', { error: 'Datos de pánico incompletos' });
          return;
        }

        const { rows } = await pool.query(
          `SELECT id, comuna_id FROM permiso
           WHERE usuario_id = $1 AND estado IN ('ACTIVO', 'ACTIVO_PENDIENTE_EVIDENCIA')
           ORDER BY created_at DESC LIMIT 1`,
          [usuarioId]
        );
        const permiso = rows[0];

        if (!permiso) {
          socket.emit('panico:error', { error: 'No hay un permiso activo asociado a este usuario' });
          return;
        }

        const { rows: alertaRows } = await pool.query(
          `INSERT INTO alerta_panico (permiso_id, origen, ubicacion)
           VALUES ($1, 'APP', ST_SetSRID(ST_MakePoint($2, $3), 4326))
           RETURNING id, activado_at`,
          [permiso.id, ubicacion.lng, ubicacion.lat]
        );
        const alerta = alertaRows[0];

        socket.emit('panico:confirmado', { recibidoEn: alerta.activado_at });

        io.to(`comuna:${permiso.comuna_id}`).emit('panico:nuevo', {
          alertaId: alerta.id,
          permisoId: permiso.id,
          usuarioId,
          nombre,
          ubicacion,
          activadoEn: alerta.activado_at,
        });
      } catch (err) {
        console.error('Error procesando panico:enviar:', err);
        socket.emit('panico:error', { error: 'No se pudo procesar la alerta de pánico' });
      }
    });
  });
}

module.exports = { registrarPanicoSocket };
