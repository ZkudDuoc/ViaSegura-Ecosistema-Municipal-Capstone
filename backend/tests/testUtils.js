process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { firmarToken } = require('../src/utils/jwt');

function tokenMunicipal({ id = 'op-1', comuna_id = 'comuna-1', rol = 'OPERADOR_MUNICIPAL' } = {}) {
  return firmarToken({ id, rol, empresa_id: null, comuna_id });
}

function tokenChofer({ id = 'chofer-1', empresa_id = 'empresa-1', rol = 'CHOFER' } = {}) {
  return firmarToken({ id, rol, empresa_id, comuna_id: null });
}

module.exports = { tokenMunicipal, tokenChofer };
