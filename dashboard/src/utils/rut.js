// Formato para mostrar un RUT: 12.345.678-9 (acepta con o sin puntos y guion).
export function formatearRut(rut) {
  const limpio = String(rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length < 2) return limpio;
  const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cuerpo}-${limpio.slice(-1)}`;
}

export function iniciales(nombre) {
  return (nombre ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}