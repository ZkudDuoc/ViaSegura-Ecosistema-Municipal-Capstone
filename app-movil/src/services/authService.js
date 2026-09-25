import api from "./api";

export function login(email, password) {
  return api.post("/auth/login", { email, password }).then((res) => res.data);
}

// tipo_persona: "EMPRESA" (default, requiere empresa_id) | "NATURAL" (sin
// empresa registrada, solo para CHOFER/LOGISTICA).
export function registrar({ rol, nombre, rut, email, password, empresa_id, comuna_id, tipo_persona }) {
  return api
    .post("/auth/registrar", { rol, nombre, rut, email, password, empresa_id, comuna_id, tipo_persona })
    .then((res) => res.data);
}

// Base del guard de sesión: confirma que el token sigue siendo válido y trae
// el perfil actualizado del usuario (nombre/email/rut no viajan en el JWT).
export function obtenerPerfil() {
  return api.get("/auth/me").then((res) => res.data);
}
