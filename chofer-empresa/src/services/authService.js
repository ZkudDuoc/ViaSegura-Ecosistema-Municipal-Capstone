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

// Registro público de una EMPRESA (Semana 6): crea la empresa y su primer
// usuario administrador (LOGISTICA) en un solo paso. Devuelve { empresa, usuario, token }.
// body: { empresa: { rut, razon_social, giro, nombre_fantasia?, direccion, comuna, region,
//         email_contacto, telefono, representante_legal: { nombre, rut } },
//         usuario: { nombre, rut, email, password } }
export function registrarEmpresa(datos) {
  return api.post("/auth/registrar-empresa", datos).then((res) => res.data);
}
