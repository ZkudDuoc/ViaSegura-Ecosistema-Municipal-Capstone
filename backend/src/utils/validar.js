const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const esUuid = (v) => typeof v === 'string' && UUID.test(v);
const esEmail = (v) => typeof v === 'string' && v.length <= 254 && EMAIL.test(v);
const textoNoVacio = (v, max = 200) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

function fechaIso(valor) {
  if (typeof valor !== 'string' || !FECHA_ISO.test(valor)) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diaIso(valor) {
  if (typeof valor !== 'string' || !DIA_ISO.test(valor)) return null;
  const d = new Date(`${valor}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : valor;
}

// Rango [desde, hasta] validado, con tope de días. Lanza un Error con
// `.status = 400` y mensaje legible para el cliente.
function rangoFechasValidado({ desde, hasta }, { defectoDias = 30, maxDias = 365 } = {}) {
  const fin = hasta ? fechaIso(hasta) : new Date();
  if (!fin) throw errorValidacion('hasta no es una fecha ISO válida');

  const inicio = desde ? fechaIso(desde) : new Date(fin.getTime() - defectoDias * 86400000);
  if (!inicio) throw errorValidacion('desde no es una fecha ISO válida');

  if (inicio > fin) throw errorValidacion('desde no puede ser posterior a hasta');
  if ((fin - inicio) / 86400000 > maxDias) throw errorValidacion(`El rango máximo permitido es de ${maxDias} días`);

  return { desde: inicio, hasta: fin };
}

// Error con mensaje seguro para el cliente: el handler global lo devuelve tal
// cual (los demás errores se reemplazan por mensajes genéricos).
function errorHttp(status, mensaje) {
  const err = new Error(mensaje);
  err.status = status;
  err.publico = true;
  return err;
}

const errorValidacion = (mensaje) => errorHttp(400, mensaje);

module.exports = { esUuid, esEmail, textoNoVacio, fechaIso, diaIso, rangoFechasValidado, errorValidacion, errorHttp };
