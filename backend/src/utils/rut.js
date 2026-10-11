// Normaliza a "12345678-9" (sin puntos, dígito verificador en mayúscula).
function normalizarRut(valor) {
  if (typeof valor !== 'string') return null;
  const limpio = valor.replace(/[.\s]/g, '').toUpperCase();
  const match = /^(\d{1,8})-?([\dK])$/.exec(limpio);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

// Valida formato y dígito verificador (módulo 11) de un RUT chileno.
function validarRut(valor) {
  const rut = normalizarRut(valor);
  if (!rut) return false;

  const [cuerpo, dv] = rut.split('-');
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === esperado;
}

module.exports = { normalizarRut, validarRut };
