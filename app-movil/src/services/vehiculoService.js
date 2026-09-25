import api from "./api";

// Registra un vehículo (patente + medidas). Queda ligado automáticamente a
// la empresa del usuario autenticado, o al propio usuario si es persona
// natural (sin empresa_id) — el Backend decide eso solo, no hace falta
// mandar empresa_id ni usuario_id acá.
export function crearVehiculo({ patente, alto_m, ancho_m, largo_m, peso_ton }) {
  return api.post("/vehiculos", { patente, alto_m, ancho_m, largo_m, peso_ton }).then((res) => res.data);
}

// Vehículos disponibles para el usuario autenticado (los de su empresa, o
// los propios si es persona natural) — para elegir cuál usar al crear un permiso.
export function listarVehiculos() {
  return api.get("/vehiculos").then((res) => res.data);
}
