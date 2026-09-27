import api from "./api";

export function login(email, password) {
  return api.post("/auth/login", { email, password }).then((res) => res.data);
}

// Valida el token guardado contra el Backend y trae el perfil actualizado.
export function me() {
  return api.get("/auth/me").then((res) => res.data);
}