import api from "./api";

export function listarComunas() {
  return api.get("/comunas").then((res) => res.data);
}

// Público: se usa en el registro, antes de tener sesión.
export function listarEmpresas() {
  return api.get("/empresas").then((res) => res.data);
}