// Nombre con el que se muestra la empresa: el de fantasía si lo tiene (es el
// que la gente reconoce) y si no la razón social. Viene de GET /api/auth/me.
export function nombreEmpresa(usuario) {
  const empresa = usuario?.empresa;
  return empresa?.nombre_fantasia || empresa?.razon_social || null;
}

// Iniciales para el círculo del perfil: "Ana Pérez Soto" -> "AP".
export function iniciales(nombre) {
  return (nombre ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

export const ROL_TEXTO = {
  LOGISTICA: "Administrador de la empresa",
  CHOFER: "Chofer",
};