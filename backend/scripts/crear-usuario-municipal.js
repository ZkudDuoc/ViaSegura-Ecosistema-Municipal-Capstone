#!/usr/bin/env node
// Crea una cuenta municipal (operador o inspector). Estas cuentas NO se
// pueden crear por el registro público.
//
//   node scripts/crear-usuario-municipal.js \
//     --rol OPERADOR_MUNICIPAL --nombre "Ana Pérez" --rut 12345678-5 \
//     --email ana@municipalidad.cl --password "clave-segura-123" \
//     --comuna "Santiago Centro"
//
// --rol: OPERADOR_MUNICIPAL | INSPECTOR_MUNICIPAL
// --comuna: nombre exacto o UUID de la comuna. Usa DATABASE_URL del entorno.
require('dotenv').config();
const bcrypt = require('bcrypt');
const { validarRut, normalizarRut } = require('../src/utils/rut');
const { esEmail, esUuid, textoNoVacio } = require('../src/utils/validar');

const ROLES = ['OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL'];

function leerArgumentos(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

async function crearUsuarioMunicipal({ rol, nombre, rut, email, password, comuna }, pool) {
  if (!ROLES.includes(rol)) throw new Error(`--rol debe ser uno de: ${ROLES.join(', ')}`);
  if (!textoNoVacio(nombre, 120)) throw new Error('--nombre es obligatorio');
  if (!validarRut(rut)) throw new Error('--rut no es un RUT chileno válido');
  if (!esEmail(email)) throw new Error('--email no es válido');
  if (typeof password !== 'string' || password.length < 8) throw new Error('--password debe tener al menos 8 caracteres');
  if (!textoNoVacio(comuna)) throw new Error('--comuna es obligatoria (nombre o UUID)');

  const { rows: comunaRows } = await pool.query(
    esUuid(comuna) ? 'SELECT id, nombre FROM comuna WHERE id = $1' : 'SELECT id, nombre FROM comuna WHERE nombre = $1',
    [comuna]
  );
  if (!comunaRows[0]) throw new Error(`No existe la comuna "${comuna}"`);

  const password_hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO usuario (rol, nombre, rut, email, password_hash, empresa_id, comuna_id, tipo_persona)
     VALUES ($1, $2, $3, $4, $5, NULL, $6, 'EMPRESA')
     RETURNING id, rol, nombre, rut, email, comuna_id`,
    [rol, nombre.trim(), normalizarRut(rut), email.trim().toLowerCase(), password_hash, comunaRows[0].id]
  );

  return { ...rows[0], comuna: comunaRows[0].nombre };
}

async function main() {
  const pool = require('../src/config/db');
  try {
    const usuario = await crearUsuarioMunicipal(leerArgumentos(process.argv.slice(2)), pool);
    console.log('Usuario municipal creado:', usuario);
  } catch (err) {
    console.error(`Error: ${err.code === '23505' ? 'ya existe un usuario con ese email o RUT' : err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { crearUsuarioMunicipal, leerArgumentos };
