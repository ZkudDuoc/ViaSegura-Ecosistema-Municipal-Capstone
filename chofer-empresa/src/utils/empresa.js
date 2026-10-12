// Nombre con el que se muestra la empresa: el de fantasía si lo tiene (es el
// que la gente reconoce) y si no la razón social. Viene de GET /api/auth/me.
export function nombreEmpresa(usuario) {
  const empresa = usuario?.empresa;
  return empresa?.nombre_fantasia || empresa?.razon_social || null;
}