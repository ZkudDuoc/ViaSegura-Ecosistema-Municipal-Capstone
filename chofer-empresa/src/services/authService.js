import api from "./api";

export function login(email, password) {
  return api.post("/auth/login", { email, password }).then((res) => res.data);
}

export function me() {
  return api.get("/auth/me").then((res) => res.data);
}

// Registro público: solo cuentas de CHOFER / LOGISTICA. Devuelve { usuario, token }.
export function registrar(datos) {
  return api.post("/auth/registrar", datos).then((res) => res.data);
}