const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { firmarToken } = require('../utils/jwt');
const { validarRut, normalizarRut } = require('../utils/rut');
const { esEmail, textoNoVacio } = require('../utils/validar');

const ROLES_EMPRESA = ['CHOFER', 'LOGISTICA'];
const ROLES_COMUNA = ['OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL'];
const PASSWORD_MINIMA = 8;

function normalizarEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// Valida los datos comunes de una persona usuaria. Devuelve un mensaje de
// error o null si todo está bien.
function errorDatosUsuario({ nombre, rut, email, password }) {
  if (!textoNoVacio(nombre, 120)) return 'El nombre es obligatorio';
  if (!validarRut(rut)) return 'El RUT del usuario no es válido';
  if (!esEmail(email)) return 'El email no es válido';
  if (typeof password !== 'string' || password.length < PASSWORD_MINIMA) {
    return `La contraseña debe tener al menos ${PASSWORD_MINIMA} caracteres`;
  }
  return null;
}

function errorUnicidad(err) {
  if (err.code !== '23505') return null;
  const restriccion = err.constraint || '';
  if (restriccion.includes('rut_empresa')) return 'Ya existe una empresa registrada con ese RUT';
  if (restriccion.includes('email')) return 'Ya existe una cuenta con ese email';
  if (restriccion.includes('rut')) return 'Ya existe una cuenta con ese RUT';
  return 'Ya existe un registro con esos datos';
}

// POST /api/auth/registrar — alta de un CHOFER o LOGISTICA en una empresa YA
// registrada. Las cuentas municipales NO se crean por acá (ver
// scripts/crear-usuario-municipal.js) y no existe registro de persona natural.
async function registrar(req, res) {
  const { rol, nombre, rut, email, password, empresa_id, tipo_persona } = req.body;

  if (!rol || !nombre || !rut || !email || !password) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  if (ROLES_COMUNA.includes(rol)) {
    return res.status(403).json({ error: 'Las cuentas municipales no se crean por registro público' });
  }
  if (!ROLES_EMPRESA.includes(rol)) {
    return res.status(400).json({ error: 'rol inválido' });
  }
  if (tipo_persona === 'NATURAL') {
    return res.status(400).json({ error: 'Solo se registran empresas: no existe registro de persona natural' });
  }
  if (!empresa_id) {
    return res.status(400).json({ error: `empresa_id es obligatorio para el rol ${rol}` });
  }

  const emailFinal = normalizarEmail(email);
  const errorDatos = errorDatosUsuario({ nombre, rut, email: emailFinal, password });
  if (errorDatos) {
    return res.status(400).json({ error: errorDatos });
  }

  const { rows: empresaRows } = await pool.query('SELECT id FROM empresa WHERE id = $1', [empresa_id]);
  if (!empresaRows[0]) {
    return res.status(400).json({ error: 'empresa_id no corresponde a una empresa registrada' });
  }

  const password_hash = await bcrypt.hash(password, 10);

  try {
    const { rows } = await pool.query(
      `INSERT INTO usuario (rol, nombre, rut, email, password_hash, empresa_id, comuna_id, tipo_persona)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, 'EMPRESA')
       RETURNING id, rol, nombre, rut, email, empresa_id, comuna_id, tipo_persona`,
      [rol, nombre.trim(), normalizarRut(rut), emailFinal, password_hash, empresa_id]
    );

    const usuario = rows[0];
    res.status(201).json({ usuario, token: firmarToken(usuario) });
  } catch (err) {
    const mensaje = errorUnicidad(err);
    if (mensaje) return res.status(409).json({ error: mensaje });
    throw err;
  }
}

// POST /api/auth/registrar-empresa — público. Crea la empresa y su primer
// usuario (LOGISTICA, administrador) en UNA sola sentencia, así que o se
// crean los dos o ninguno.
async function registrarEmpresa(req, res) {
  const { empresa, usuario } = req.body || {};

  if (!empresa || !usuario) {
    return res.status(400).json({ error: 'Se requieren los datos de la empresa y del usuario administrador' });
  }

  const representante = empresa.representante_legal || {};
  const emailUsuario = normalizarEmail(usuario.email);
  const emailContacto = normalizarEmail(empresa.email_contacto);

  const camposTexto = [
    ['razon_social', empresa.razon_social],
    ['giro', empresa.giro],
    ['direccion', empresa.direccion],
    ['comuna', empresa.comuna],
    ['region', empresa.region],
    ['telefono', empresa.telefono],
    ['representante_legal.nombre', representante.nombre],
  ];
  const faltante = camposTexto.find(([, valor]) => !textoNoVacio(valor));
  if (faltante) {
    return res.status(400).json({ error: `El campo ${faltante[0]} es obligatorio` });
  }
  if (!validarRut(empresa.rut)) {
    return res.status(400).json({ error: 'El RUT de la empresa no es válido' });
  }
  if (!validarRut(representante.rut)) {
    return res.status(400).json({ error: 'El RUT del representante legal no es válido' });
  }
  if (!esEmail(emailContacto)) {
    return res.status(400).json({ error: 'El email de contacto de la empresa no es válido' });
  }
  const errorDatos = errorDatosUsuario({ ...usuario, email: emailUsuario });
  if (errorDatos) {
    return res.status(400).json({ error: errorDatos });
  }

  const password_hash = await bcrypt.hash(usuario.password, 10);
  const nombreFantasia = textoNoVacio(empresa.nombre_fantasia) ? empresa.nombre_fantasia.trim() : null;

  try {
    const { rows } = await pool.query(
      `WITH e AS (
         INSERT INTO empresa (
           nombre, rut_empresa, razon_social, giro, nombre_fantasia, direccion, comuna, region,
           email_contacto, telefono, representante_nombre, representante_rut
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, rut_empresa, razon_social, nombre_fantasia
       ), u AS (
         INSERT INTO usuario (rol, nombre, rut, email, password_hash, empresa_id, comuna_id, tipo_persona)
         SELECT 'LOGISTICA', $13, $14, $15, $16, e.id, NULL, 'EMPRESA' FROM e
         RETURNING id, rol, nombre, rut, email, empresa_id, comuna_id, tipo_persona
       )
       SELECT
         u.id, u.rol, u.nombre, u.rut, u.email, u.empresa_id, u.comuna_id, u.tipo_persona,
         e.rut_empresa, e.razon_social AS empresa_razon_social, e.nombre_fantasia AS empresa_nombre_fantasia
       FROM u, e`,
      [
        nombreFantasia || empresa.razon_social.trim(),
        normalizarRut(empresa.rut),
        empresa.razon_social.trim(),
        empresa.giro.trim(),
        nombreFantasia,
        empresa.direccion.trim(),
        empresa.comuna.trim(),
        empresa.region.trim(),
        emailContacto,
        empresa.telefono.trim(),
        representante.nombre.trim(),
        normalizarRut(representante.rut),
        usuario.nombre.trim(),
        normalizarRut(usuario.rut),
        emailUsuario,
        password_hash,
      ]
    );

    const fila = rows[0];
    const usuarioCreado = {
      id: fila.id,
      rol: fila.rol,
      nombre: fila.nombre,
      rut: fila.rut,
      email: fila.email,
      empresa_id: fila.empresa_id,
      comuna_id: fila.comuna_id,
      tipo_persona: fila.tipo_persona,
    };

    res.status(201).json({
      empresa: {
        id: fila.empresa_id,
        rut: fila.rut_empresa,
        razon_social: fila.empresa_razon_social,
        nombre_fantasia: fila.empresa_nombre_fantasia,
      },
      usuario: usuarioCreado,
      token: firmarToken(usuarioCreado),
    });
  } catch (err) {
    const mensaje = errorUnicidad(err);
    if (mensaje) return res.status(409).json({ error: mensaje });
    throw err;
  }
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son obligatorios' });
  }

  const { rows } = await pool.query('SELECT * FROM usuario WHERE lower(email) = $1', [normalizarEmail(email)]);
  const usuario = rows[0];

  if (!usuario || !usuario.password_hash) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const passwordValida = await bcrypt.compare(password, usuario.password_hash);

  if (!passwordValida) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = firmarToken(usuario);
  delete usuario.password_hash;

  res.json({ usuario, token });
}

// GET /api/auth/me — base del guard de sesión del frontend: confirma que el
// token sigue siendo válido y devuelve el perfil actualizado del usuario
// (el JWT solo trae sub/rol/empresa_id/comuna_id, no nombre/email/rut) más
// los datos de su empresa para la pantalla de bienvenida.
async function me(req, res) {
  const { rows } = await pool.query(
    `SELECT u.id, u.rol, u.nombre, u.rut, u.email, u.empresa_id, u.comuna_id, u.tipo_persona,
            e.rut_empresa AS empresa_rut, e.razon_social AS empresa_razon_social,
            e.nombre AS empresa_nombre, e.nombre_fantasia AS empresa_nombre_fantasia
     FROM usuario u
     LEFT JOIN empresa e ON e.id = u.empresa_id
     WHERE u.id = $1`,
    [req.usuario.sub]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const { empresa_rut, empresa_razon_social, empresa_nombre, empresa_nombre_fantasia, ...perfil } = rows[0];

  res.json({
    ...perfil,
    empresa: perfil.empresa_id
      ? {
          id: perfil.empresa_id,
          rut: empresa_rut ?? null,
          razon_social: empresa_razon_social ?? empresa_nombre ?? null,
          nombre_fantasia: empresa_nombre_fantasia ?? null,
        }
      : null,
  });
}

module.exports = { registrar, registrarEmpresa, login, me };
