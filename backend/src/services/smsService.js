// Envío de SMS vía Twilio, usado como segundo escalón de la cascada de
// resiliencia del pánico (WebSocket -> SMS -> cola local).
// Si no hay credenciales configuradas (ambiente de desarrollo/demo sin
// cuenta Twilio real), el servicio no falla: reporta "no configurado" y
// deja que el llamador decida escalar a cola local.

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

function estaConfigurado() {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER);
}

let clienteTwilio = null;
function obtenerCliente() {
  if (!estaConfigurado()) return null;
  if (!clienteTwilio) {
    // require perezoso: el proyecto no depende de "twilio" si nunca se usa.
    // eslint-disable-next-line global-require
    const twilio = require('twilio');
    clienteTwilio = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return clienteTwilio;
}

// telefonos: array de strings en formato E.164 (ej. "+56912345678").
// Devuelve { enviado: boolean, detalle } — nunca lanza, para no romper la cascada.
async function enviarSMS(telefonos, mensaje) {
  if (!Array.isArray(telefonos) || telefonos.length === 0) {
    return { enviado: false, detalle: 'Sin teléfonos de alerta configurados para la comuna' };
  }

  if (!estaConfigurado()) {
    return { enviado: false, detalle: 'Servicio SMS no configurado (faltan credenciales Twilio)' };
  }

  try {
    const cliente = obtenerCliente();
    const resultados = await Promise.all(
      telefonos.map((to) =>
        cliente.messages.create({ body: mensaje, from: TWILIO_FROM_NUMBER, to })
      )
    );
    return { enviado: true, detalle: resultados.map((r) => ({ sid: r.sid, to: r.to })) };
  } catch (err) {
    return { enviado: false, detalle: err.message };
  }
}

module.exports = { enviarSMS, estaConfigurado };
