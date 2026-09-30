import api from "./api";

// Público: sin JWT, se usa desde el login sin cuenta previa ("¿eres chofer?").
// Devuelve { token, permiso_id } — el token es de sesión limitada: solo
// lectura de ESE servicio, pánico y evidencia. Guardarlo con setAuthToken()
// como si fuera un login normal.
export function canjearCodigoChofer(codigo) {
  return api.post("/codigo-chofer/canjear", { codigo }).then((res) => res.data);
}
