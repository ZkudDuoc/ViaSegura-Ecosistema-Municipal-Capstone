import api from "./api";

// El Backend liga el camión a la empresa del usuario, o al propio usuario
// si es persona natural — no hace falta enviar el dueño.
export function listarVehiculos() {
  return api.get("/vehiculos").then((res) => res.data);
}

export function crearVehiculo(datos) {
  return api.post("/vehiculos", datos).then((res) => res.data);
}