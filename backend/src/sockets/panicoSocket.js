const pool = require('../config/db');
const { verificarToken } = require('../utils/jwt');
const smsService = require('../services/smsService');
const bitacoraService = require('../services/bitacoraService');

const ROLES_MUNICIPALES = ['OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL'];

// Contrato acordado con la app móvil (app-movil/src/services/panicoSocket.js):
//   cliente emite "panico:enviar"      -> { usuarioId, nombre, ubicacion: { lat, lng }, timestamp }
//   servidor emite "panico:confirmado" -> { recibidoEn }
//   servidor emite "panico:error"      -> { error }
// Este contrato con el chofer NO cambia: la cascada de resiliencia de abajo
// decide cómo llega el aviso a los operadores municipales, pero el chofer
// siempre recibe "panico:confirmado" en cuanto la alerta queda registrada.
//
// Contrato con el dashboard municipal (operador conectado con token, une
// la sala `comuna:<id>`):
//   servidor emite "panico:nuevo"      -> alerta entregada en vivo (WS u operador recién conectado
//                                          recibiendo backlog) -> { alertaId, permisoId, usuarioId,
//                                          nombre, ubicacion, activadoEn }
//   servidor emite "panico:pendiente"  -> igual forma que "panico:nuevo", pero es una alerta que ya
//                                          había escalado a cola local (ver panico_cola_local) y se
//                                          reenvía al operador apenas se conecta.
//
// Cascada de resiliencia (sección "pánico" de la Semana 3):
//   1) WebSocket: si hay al menos un operador municipal conectado a la sala
//      de la comuna, se le notifica en vivo -> se considera entregada.
//   2) SMS: si no hay operadores conectados, se envía SMS (Twilio) a los
//      teléfonos de alerta configurados para la comuna (comuna.telefonos_alerta).
//   3) Cola local: si tampoco hay SMS configurado o el envío falla, la alerta
//      queda en panico_cola_local para que un operador la vea al conectarse
//      o para un job de reintento posterior.
// Cada intento de la cascada queda registrado en la bitácora append-only.
function registrarPanicoSocket(io) {
  io.on('connection', (socket) => {
    const { token } = socket.handshake.auth || {};

    if (token) {
      try {
        socket.usuario = verificarToken(token);
        if (ROLES_MUNICIPALES.includes(socket.usuario.rol)) {
          const comunaId = socket.usuario.comuna_id;
          socket.join(`comuna:${comunaId}`);
          flushColaLocal(socket, comunaId).catch((err) =>
            console.error('Error reenviando cola local de pánico:', err)
          );
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

        const evento = {
          alertaId: alerta.id,
          permisoId: permiso.id,
          usuarioId,
          nombre,
          ubicacion,
          activadoEn: alerta.activado_at,
        };

        await ejecutarCascadaPanico(io, { alerta, permiso, evento });
      } catch (err) {
        console.error('Error procesando panico:enviar:', err);
        socket.emit('panico:error', { error: 'No se pudo procesar la alerta de pánico' });
      }
    });
  });
}

async function flushColaLocal(socket, comunaId) {
  const { rows } = await pool.query(
    `SELECT id, payload FROM panico_cola_local
     WHERE comuna_id = $1 AND procesado = false ORDER BY created_at ASC`,
    [comunaId]
  );

  rows.forEach((item) => {
    socket.emit('panico:pendiente', { colaLocalId: item.id, ...item.payload });
  });
}

async function ejecutarCascadaPanico(io, { alerta, permiso, evento }) {
  const sala = `comuna:${permiso.comuna_id}`;
  const room = io.sockets.adapter.rooms.get(sala);
  const hayOperadorConectado = Boolean(room && room.size > 0);

  if (hayOperadorConectado) {
    io.to(sala).emit('panico:nuevo', evento);
    await bitacoraService.registrarEvento({
      permisoId: permiso.id,
      comunaId: permiso.comuna_id,
      tipoEvento: 'CASCADA_PANICO',
      detalle: { canal: 'WEBSOCKET', resultado: 'ENTREGADO', alerta_panico_id: alerta.id },
    });
    return;
  }

  const { rows: comunaRows } = await pool.query(
    `SELECT telefonos_alerta FROM comuna WHERE id = $1`,
    [permiso.comuna_id]
  );
  const telefonos = comunaRows[0]?.telefonos_alerta || [];
  const mensaje = `VíaSegura: alerta de pánico de ${evento.nombre || 'un chofer'} en su comuna. Revise el panel de operador.`;

  const resultadoSms = await smsService.enviarSMS(telefonos, mensaje);

  await bitacoraService.registrarEvento({
    permisoId: permiso.id,
    comunaId: permiso.comuna_id,
    tipoEvento: 'CASCADA_PANICO',
    detalle: {
      canal: 'SMS',
      resultado: resultadoSms.enviado ? 'ENTREGADO' : 'FALLIDO',
      motivo: resultadoSms.enviado ? undefined : resultadoSms.detalle,
      alerta_panico_id: alerta.id,
    },
  });

  if (resultadoSms.enviado) {
    return;
  }

  // Último escalón: cola local.
  await pool.query(
    `INSERT INTO panico_cola_local (alerta_panico_id, comuna_id, payload)
     VALUES ($1, $2, $3)`,
    [alerta.id, permiso.comuna_id, evento]
  );

  await bitacoraService.registrarEvento({
    permisoId: permiso.id,
    comunaId: permiso.comuna_id,
    tipoEvento: 'CASCADA_PANICO',
    detalle: { canal: 'COLA_LOCAL', resultado: 'ENCOLADO', alerta_panico_id: alerta.id },
  });
}

module.exports = { registrarPanicoSocket, ejecutarCascadaPanico };
