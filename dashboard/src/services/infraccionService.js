import api from "./api";

// Multas cursadas por los supervisores de la comuna, más recientes primero.
export function listarInfracciones() {
  return api.get("/infracciones").then((res) => res.data);
}