const LIMITE_POR_DEFECTO = 25;
const LIMITE_MAXIMO = 100;

function leerLimite(valor, { porDefecto = LIMITE_POR_DEFECTO, maximo = LIMITE_MAXIMO } = {}) {
  const n = Number.parseInt(valor, 10);
  if (!Number.isFinite(n) || n < 1) return porDefecto;
  return Math.min(n, maximo);
}

// El cursor es opaco para el cliente: (created_at como texto exacto de
// Postgres, para no perder microsegundos, + id) en base64.
function codificarCursor({ creado, id }) {
  return Buffer.from(JSON.stringify({ c: creado, i: id })).toString('base64url');
}

function decodificarCursor(cursor) {
  if (!cursor) return null;
  try {
    const { c, i } = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (typeof c !== 'string' || typeof i !== 'string') return null;
    return { creado: c, id: i };
  } catch {
    return null;
  }
}

// `filas` viene con limite+1 elementos como máximo (se pide una de más para
// saber si hay otra página). `campoCreado` es el alias con el created_at en texto.
function armarPagina(filas, limite, campoCreado = 'cursor_creado') {
  const hayMas = filas.length > limite;
  const items = hayMas ? filas.slice(0, limite) : filas;
  const ultimo = items[items.length - 1];
  const next_cursor = hayMas && ultimo ? codificarCursor({ creado: ultimo[campoCreado], id: ultimo.id }) : null;
  return { items: items.map(({ [campoCreado]: _omitido, ...resto }) => resto), next_cursor };
}

module.exports = { leerLimite, codificarCursor, decodificarCursor, armarPagina, LIMITE_MAXIMO };
