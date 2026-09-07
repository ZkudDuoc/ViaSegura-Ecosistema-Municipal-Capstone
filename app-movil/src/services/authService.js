import api from "./api";

export function login(email, password) {
  return api.post("/auth/login", { email, password }).then((res) => res.data);
}

export function registrar({ rol, nombre, rut, email, password, empresa_id, comuna_id }) {
  return api
    .post("/auth/registrar", { rol, nombre, rut, email, password, empresa_id, comuna_id })
    .then((res) => res.data);
}
