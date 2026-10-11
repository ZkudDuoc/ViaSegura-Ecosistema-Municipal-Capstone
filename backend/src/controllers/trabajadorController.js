const pool = require('../config/db');
const { validarRut, normalizarRut } = require('../utils/rut');
const { esUuid, textoNoVacio, diaIso } = require('../utils/validar');
const { leerLimite, decodificarCursor, armarPagina } = require('../utils/paginacion');

const MAX_FILAS_IMPORTACION = 500;

const COLUMNAS = `
  id, rut, nombre, cargo,
  to_char(contrato_vigente_hasta, 'YYYY-MM-DD') AS contrato_vigente_hasta,
  to_char(epp_vigente_hasta, 'YYYY-MM-DD') AS epp_vigente_hasta,
  activo, created_at`;

function empresaDe(req, res) {
  const empresaId = req.usuario.empresa_id;
  if (!empresaId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una empresa' });
    return null;
  }
  return empresaId;
}

function escaparLike(texto) {
  return texto.replace(/[\\%_]/g, '\\$&');
}

// Valida y normaliza los campos de un trabajador. `parcial` permite omitir
// campos (PATCH). Devuelve { error } o { valor }.
function validarTrabajador(datos, { parcial = false } = {}) {
  const valor = {};

  if (!parcial || datos.rut !== undefined) {
    if (!validarRut(datos.rut)) return { error: 'El RUT del trabajador no es válido' };
    valor.rut = normalizarRut(datos.rut);
  }
  if (!parcial || datos.nombre !== undefined) {
    if (!textoNoVacio(datos.nombre, 120)) return { error: 'El nombre es obligatorio' };
    valor.nombre = datos.nombre.trim();
  }
  if (datos.cargo !== undefined) {
    if (datos.cargo !== null && datos.cargo !== '' && !textoNoVacio(datos.cargo, 80)) {
      return { error: 'El cargo no es válido' };
    }
    valor.cargo = datos.cargo ? datos.cargo.trim() : null;
  }
  for (const campo of ['contrato_vigente_hasta', 'epp_vigente_hasta']) {
    if (datos[campo] !== undefined) {
      if (datos[campo] === null || datos[campo] === '') {
        valor[campo] = null;
      } else if (diaIso(datos[campo])) {
        valor[campo] = datos[campo];
      } else {
        return { error: `${campo} debe tener formato AAAA-MM-DD` };
      }
    }
  }
  if (datos.activo !== undefined) {
    if (typeof datos.activo !== 'boolean') return { error: 'activo debe ser true o false' };
    valor.activo = datos.activo;
  }

  return { valor };
}

// GET /api/trabajadores?q=&activo=&limit=&cursor= — nómina de la empresa.
// activo: omitido o "true" = solo activos; "false" = solo dados de baja;
// "todos" = ambos. Respuesta { items, next_cursor }.
async function listar(req, res) {
  const empresaId = empresaDe(req, res);
  if (!empresaId) return;

  const limite = leerLimite(req.query.limit);
  const params = [empresaId];
  const condiciones = ['empresa_id = $1'];

  if (req.query.activo !== 'todos') {
    params.push(req.query.activo !== 'false');
    condiciones.push(`activo = $${params.length}`);
  }
  if (req.query.q && String(req.query.q).trim()) {
    params.push(`%${escaparLike(String(req.query.q).trim().replace(/\./g, ''))}%`);
    condiciones.push(`(nombre ILIKE $${params.length} OR rut ILIKE $${params.length})`);
  }
  if (req.query.cursor) {
    const cursor = decodificarCursor(req.query.cursor);
    if (!cursor || !esUuid(cursor.id)) return res.status(400).json({ error: 'cursor inválido' });
    params.push(cursor.creado, cursor.id);
    condiciones.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
  }
  params.push(limite + 1);

  const { rows } = await pool.query(
    `SELECT ${COLUMNAS}, created_at::text AS cursor_creado
     FROM trabajador
     WHERE ${condiciones.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length}`,
    params
  );

  res.json(armarPagina(rows, limite));
}

async function obtener(req, res) {
  const empresaId = empresaDe(req, res);
  if (!empresaId) return;
  if (!esUuid(req.params.id)) return res.status(400).json({ error: 'id inválido' });

  const { rows } = await pool.query(`SELECT ${COLUMNAS} FROM trabajador WHERE id = $1 AND empresa_id = $2`, [
    req.params.id,
    empresaId,
  ]);
  if (!rows[0]) return res.status(404).json({ error: 'Trabajador no encontrado' });

  res.json(rows[0]);
}

async function crear(req, res) {
  const empresaId = empresaDe(req, res);
  if (!empresaId) return;

  const { error, valor } = validarTrabajador(req.body || {});
  if (error) return res.status(400).json({ error });

  try {
    const { rows } = await pool.query(
      `INSERT INTO trabajador (empresa_id, rut, nombre, cargo, contrato_vigente_hasta, epp_vigente_hasta)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNAS}`,
      [empresaId, valor.rut, valor.nombre, valor.cargo ?? null, valor.contrato_vigente_hasta ?? null, valor.epp_vigente_hasta ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un trabajador con ese RUT en tu nómina' });
    throw err;
  }
}

async function actualizar(req, res) {
  const empresaId = empresaDe(req, res);
  if (!empresaId) return;
  if (!esUuid(req.params.id)) return res.status(400).json({ error: 'id inválido' });

  const { error, valor } = validarTrabajador(req.body || {}, { parcial: true });
  if (error) return res.status(400).json({ error });

  const campos = Object.keys(valor);
  if (campos.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

  const sets = campos.map((campo, i) => `${campo} = $${i + 3}`);

  try {
    const { rows } = await pool.query(
      `UPDATE trabajador SET ${sets.join(', ')} WHERE id = $1 AND empresa_id = $2 RETURNING ${COLUMNAS}`,
      [req.params.id, empresaId, ...campos.map((c) => valor[c])]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Trabajador no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un trabajador con ese RUT en tu nómina' });
    throw err;
  }
}

// Baja lógica: los permisos pasados guardan una copia, pero el historial
// sigue refiriéndose al trabajador.
async function darDeBaja(req, res) {
  const empresaId = empresaDe(req, res);
  if (!empresaId) return;
  if (!esUuid(req.params.id)) return res.status(400).json({ error: 'id inválido' });

  const { rows } = await pool.query(
    `UPDATE trabajador SET activo = false WHERE id = $1 AND empresa_id = $2 AND activo = true RETURNING id, activo`,
    [req.params.id, empresaId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Trabajador no encontrado o ya dado de baja' });

  res.json(rows[0]);
}

// --- Importación de nómina (JSON o CSV) ---

const ALIAS_COLUMNAS = {
  rut: 'rut',
  nombre: 'nombre',
  cargo: 'cargo',
  contrato_vigente_hasta: 'contrato_vigente_hasta',
  contrato: 'contrato_vigente_hasta',
  epp_vigente_hasta: 'epp_vigente_hasta',
  epp: 'epp_vigente_hasta',
};

function parsearCsv(texto) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length < 2) return [];

  const separador = lineas[0].includes(';') ? ';' : ',';
  const encabezados = lineas[0].split(separador).map((h) => ALIAS_COLUMNAS[h.trim().toLowerCase()] ?? null);

  return lineas.slice(1).map((linea) => {
    const celdas = linea.split(separador).map((c) => c.trim().replace(/^"|"$/g, ''));
    const fila = {};
    encabezados.forEach((campo, i) => {
      if (campo) fila[campo] = celdas[i] ?? '';
    });
    return fila;
  });
}

// POST /api/trabajadores/importar — JSON { trabajadores:[...] } o
// { csv:"..." }, o el CSV como cuerpo con Content-Type text/csv.
// Responde { creados, actualizados, errores:[{fila, motivo}] }; `fila` es la
// posición de la fila de datos (la primera fila de datos es la 1).
async function importar(req, res) {
  const empresaId = empresaDe(req, res);
  if (!empresaId) return;

  let filas;
  if (typeof req.body === 'string') filas = parsearCsv(req.body);
  else if (Array.isArray(req.body?.trabajadores)) filas = req.body.trabajadores;
  else if (typeof req.body?.csv === 'string') filas = parsearCsv(req.body.csv);
  else return res.status(400).json({ error: 'Envía { trabajadores: [...] }, { csv: "..." } o un CSV (text/csv)' });

  if (filas.length === 0) return res.status(400).json({ error: 'La nómina no trae filas' });
  if (filas.length > MAX_FILAS_IMPORTACION) {
    return res.status(400).json({ error: `Máximo ${MAX_FILAS_IMPORTACION} filas por importación` });
  }

  let creados = 0;
  let actualizados = 0;
  const errores = [];

  for (const [indice, fila] of filas.entries()) {
    const { error, valor } = validarTrabajador(fila || {});
    if (error) {
      errores.push({ fila: indice + 1, motivo: error });
      continue;
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO trabajador (empresa_id, rut, nombre, cargo, contrato_vigente_hasta, epp_vigente_hasta)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (empresa_id, rut) DO UPDATE SET
           nombre = EXCLUDED.nombre,
           cargo = EXCLUDED.cargo,
           contrato_vigente_hasta = EXCLUDED.contrato_vigente_hasta,
           epp_vigente_hasta = EXCLUDED.epp_vigente_hasta,
           activo = true
         RETURNING (xmax = 0) AS creado`,
        [empresaId, valor.rut, valor.nombre, valor.cargo ?? null, valor.contrato_vigente_hasta ?? null, valor.epp_vigente_hasta ?? null]
      );
      if (rows[0]?.creado) creados += 1;
      else actualizados += 1;
    } catch (err) {
      console.error('Error importando trabajador:', err.code || err.message);
      errores.push({ fila: indice + 1, motivo: 'No se pudo guardar la fila' });
    }
  }

  res.json({ creados, actualizados, errores });
}

module.exports = { listar, obtener, crear, actualizar, darDeBaja, importar, parsearCsv, validarTrabajador };
