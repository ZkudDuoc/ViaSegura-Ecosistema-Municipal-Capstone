const pool = require('../config/db');
const { esUuid, textoNoVacio } = require('../utils/validar');
const { leerLimite, decodificarCursor, armarPagina } = require('../utils/paginacion');

const ROLES_EMPRESA = ['CHOFER', 'LOGISTICA'];
const COLUMNAS = 'id, patente, alto_m, ancho_m, largo_m, peso_ton, empresa_id, usuario_id, activo, created_at';
const MEDIDAS = ['alto_m', 'ancho_m', 'largo_m', 'peso_ton'];

const esMedida = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

function normalizarPatente(patente) {
  return patente.replace(/[\s-]/g, '').toUpperCase();
}

function escaparLike(texto) {
  return texto.replace(/[\\%_]/g, '\\$&');
}

// Condición SQL de pertenencia: el vehículo es de la empresa del usuario o,
// si no tiene empresa, del propio usuario (cuentas anteriores a la Semana 6).
function condicionDueno(usuario) {
  return usuario.empresa_id
    ? { sql: 'empresa_id = $2', valor: usuario.empresa_id }
    : { sql: 'usuario_id = $2', valor: usuario.sub };
}

// POST /api/vehiculos — registra un vehículo. Queda ligado a la empresa del
// usuario automáticamente.
async function crear(req, res) {
  const { patente, alto_m, ancho_m, largo_m, peso_ton } = req.body;

  if (!patente || alto_m == null || ancho_m == null || largo_m == null || peso_ton == null) {
    return res.status(400).json({ error: 'patente, alto_m, ancho_m, largo_m y peso_ton son obligatorios' });
  }
  if (!textoNoVacio(String(patente), 12) || ![alto_m, ancho_m, largo_m, peso_ton].every(esMedida)) {
    return res.status(400).json({ error: 'La patente y las medidas deben ser valores válidos (medidas numéricas mayores a 0)' });
  }

  const { empresa_id, sub: usuario_id } = req.usuario;
  const esPersonaNatural = !empresa_id;

  try {
    const { rows } = await pool.query(
      `INSERT INTO vehiculo (patente, alto_m, ancho_m, largo_m, peso_ton, empresa_id, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNAS}`,
      [patente, alto_m, ancho_m, largo_m, peso_ton, esPersonaNatural ? null : empresa_id, esPersonaNatural ? usuario_id : null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un vehículo registrado con esa patente' });
    throw err;
  }
}

// GET /api/vehiculos?q=&limit=&cursor= — vehículos ACTIVOS de la empresa del
// usuario (o los propios). Sin `limit` devuelve todos (contrato anterior);
// con `limit` pagina y entrega el siguiente cursor en el header X-Next-Cursor.
async function listar(req, res) {
  const { empresa_id, sub: usuario_id, rol } = req.usuario;

  if (!ROLES_EMPRESA.includes(rol)) {
    return res.status(403).json({ error: 'Rol sin permiso para esta acción' });
  }

  const query = req.query ?? {};
  const params = [empresa_id || usuario_id];
  const condiciones = [(empresa_id ? 'empresa_id' : 'usuario_id') + ' = $1', 'activo = true'];

  if (query.q && String(query.q).trim()) {
    params.push(`%${escaparLike(normalizarPatente(String(query.q)))}%`);
    condiciones.push(`patente ILIKE $${params.length}`);
  }

  const paginar = query.limit !== undefined;
  const limite = paginar ? leerLimite(query.limit) : null;

  if (paginar && query.cursor) {
    const cursor = decodificarCursor(query.cursor);
    if (!cursor || !esUuid(cursor.id)) return res.status(400).json({ error: 'cursor inválido' });
    params.push(cursor.creado, cursor.id);
    condiciones.push(`(patente, id) > ($${params.length - 1}, $${params.length}::uuid)`);
  }

  let limiteSql = '';
  if (paginar) {
    params.push(limite + 1);
    limiteSql = `LIMIT $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT ${COLUMNAS}, patente AS cursor_clave
     FROM vehiculo
     WHERE ${condiciones.join(' AND ')}
     ORDER BY patente, id
     ${limiteSql}`,
    params
  );

  if (!paginar) {
    return res.json(rows.map(({ cursor_clave: _clave, ...vehiculo }) => vehiculo));
  }

  const { items, next_cursor } = armarPagina(rows, limite, 'cursor_clave');
  if (next_cursor) res.set('X-Next-Cursor', next_cursor);
  res.json(items);
}

// PATCH /api/vehiculos/:id — solo LOGISTICA, solo de su propia empresa.
async function actualizar(req, res) {
  if (!esUuid(req.params.id)) return res.status(400).json({ error: 'id inválido' });

  const datos = req.body || {};
  const valor = {};

  if (datos.patente !== undefined) {
    if (!textoNoVacio(String(datos.patente), 12)) return res.status(400).json({ error: 'La patente no es válida' });
    valor.patente = datos.patente;
  }
  for (const medida of MEDIDAS) {
    if (datos[medida] !== undefined) {
      if (!esMedida(datos[medida])) return res.status(400).json({ error: `${medida} debe ser un número mayor a 0` });
      valor[medida] = datos[medida];
    }
  }
  if (datos.activo !== undefined) {
    if (typeof datos.activo !== 'boolean') return res.status(400).json({ error: 'activo debe ser true o false' });
    valor.activo = datos.activo;
  }

  const campos = Object.keys(valor);
  if (campos.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

  const dueno = condicionDueno(req.usuario);
  const sets = campos.map((campo, i) => `${campo} = $${i + 3}`);

  try {
    const { rows } = await pool.query(
      `UPDATE vehiculo SET ${sets.join(', ')} WHERE id = $1 AND ${dueno.sql} RETURNING ${COLUMNAS}`,
      [req.params.id, dueno.valor, ...campos.map((c) => valor[c])]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Vehículo no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un vehículo registrado con esa patente' });
    throw err;
  }
}

// DELETE /api/vehiculos/:id — baja lógica (los permisos pasados lo referencian).
async function darDeBaja(req, res) {
  if (!esUuid(req.params.id)) return res.status(400).json({ error: 'id inválido' });

  const dueno = condicionDueno(req.usuario);
  const { rows } = await pool.query(
    `UPDATE vehiculo SET activo = false WHERE id = $1 AND ${dueno.sql} AND activo = true RETURNING id, activo`,
    [req.params.id, dueno.valor]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Vehículo no encontrado o ya dado de baja' });

  res.json(rows[0]);
}

module.exports = { crear, listar, actualizar, darDeBaja };
