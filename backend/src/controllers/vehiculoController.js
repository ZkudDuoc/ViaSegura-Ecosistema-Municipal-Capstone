const pool = require('../config/db');

const ROLES_EMPRESA = ['CHOFER', 'LOGISTICA'];

// POST /api/vehiculos — registra un vehículo. Queda ligado a la empresa del
// usuario si es persona jurídica, o al propio usuario si es persona natural
// (tipo_persona = 'NATURAL', sin empresa_id).
async function crear(req, res) {
  const { patente, alto_m, ancho_m, largo_m, peso_ton } = req.body;

  if (!patente || alto_m == null || ancho_m == null || largo_m == null || peso_ton == null) {
    return res.status(400).json({ error: 'patente, alto_m, ancho_m, largo_m y peso_ton son obligatorios' });
  }

  const { empresa_id, sub: usuario_id } = req.usuario;
  const esPersonaNatural = !empresa_id;

  const { rows } = await pool.query(
    `INSERT INTO vehiculo (patente, alto_m, ancho_m, largo_m, peso_ton, empresa_id, usuario_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, patente, alto_m, ancho_m, largo_m, peso_ton, empresa_id, usuario_id, created_at`,
    [patente, alto_m, ancho_m, largo_m, peso_ton, esPersonaNatural ? null : empresa_id, esPersonaNatural ? usuario_id : null]
  );

  res.status(201).json(rows[0]);
}

// GET /api/vehiculos — lista los vehículos disponibles para el usuario
// autenticado: los de su empresa (persona jurídica) o los propios (persona natural).
async function listar(req, res) {
  const { empresa_id, sub: usuario_id, rol } = req.usuario;

  if (!ROLES_EMPRESA.includes(rol)) {
    return res.status(403).json({ error: 'Rol sin permiso para esta acción' });
  }

  const { rows } = await pool.query(
    empresa_id
      ? `SELECT id, patente, alto_m, ancho_m, largo_m, peso_ton, empresa_id, usuario_id, created_at
         FROM vehiculo WHERE empresa_id = $1 ORDER BY patente`
      : `SELECT id, patente, alto_m, ancho_m, largo_m, peso_ton, empresa_id, usuario_id, created_at
         FROM vehiculo WHERE usuario_id = $1 ORDER BY patente`,
    [empresa_id || usuario_id]
  );

  res.json(rows);
}

module.exports = { crear, listar };
