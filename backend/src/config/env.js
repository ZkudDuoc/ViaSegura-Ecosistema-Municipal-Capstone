const OBLIGATORIAS = ['JWT_SECRET', 'DATABASE_URL'];

// Falla rápido al arrancar si falta configuración crítica, en vez de descubrirlo
// con el primer login o la primera consulta.
function validarEntorno(env = process.env) {
  const faltantes = OBLIGATORIAS.filter((clave) => !env[clave]);
  if (faltantes.length > 0) {
    throw new Error(`Faltan variables de entorno obligatorias: ${faltantes.join(', ')}`);
  }
  if (env.NODE_ENV === 'production' && env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción');
  }
}

module.exports = { validarEntorno };
