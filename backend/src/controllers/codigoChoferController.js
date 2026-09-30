const pool = require('../config/db');
const codigoChoferService = require('../services/codigoChoferService');

// POST /api/permisos/:id/codigo-chofer — la empresa (dueña del permiso)
// genera un código de un solo uso para pasárselo a un chofer sin cuenta.
async function generar(req, res) {
  const { rows } = await pool.query(
    `SELECT id FROM permiso WHERE id = $1 AND usuario_id = $2`,
    [req.params.id, req.usuario.sub]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: 'Permiso no encontrado' });
  }

  const codigo = await codigoChoferService.generarCodigo(req.params.id, req.usuario.sub);
  res.status(201).json(codigo);
}

// POST /api/codigo-chofer/canjear — PÚBLICO, sin JWT. Protegido por
// rate limiting (ver routes) y porque el código es de 128 bits, un solo uso
// y expira. Devuelve una sesión limitada (solo lectura del servicio,
// pánico y evidencia — ver requireAuthOCodigoChofer).
async function canjear(req, res) {
  const { codigo } = req.body;

  if (!codigo) {
    return res.status(400).json({ error: 'codigo es obligatorio' });
  }

  const resultado = await codigoChoferService.canjearCodigo(codigo);

  if (!resultado.ok) {
    return res.status(401).json({ error: resultado.error });
  }

  res.json({ token: resultado.token, permiso_id: resultado.permisoId });
}

module.exports = { generar, canjear };
