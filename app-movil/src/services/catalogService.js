import api from "./api";

export function listarComunas() {
  return api.get("/comunas").then((res) => res.data);
}

export function listarEmpresas() {
  return api.get("/empresas").then((res) => res.data);
}
