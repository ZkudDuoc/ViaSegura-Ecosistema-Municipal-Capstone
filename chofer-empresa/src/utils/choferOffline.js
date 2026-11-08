import { obtenerQrSecreto } from "../services/choferApi";

// Lo que el chofer necesita sin señal: la clave del QR y los últimos datos de su servicio.
const CLAVE_QR = "viasegura_chofer_qr";
const CLAVE_SERVICIOS = "viasegura_chofer_cache";

function leer(clave) {
  try {
    return JSON.parse(localStorage.getItem(clave) ?? "{}");
  } catch {
    return {};
  }
}

function escribir(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin espacio o sin storage: el servicio simplemente no queda disponible sin señal.
  }
}

export function leerQr(permisoId) {
  return leer(CLAVE_QR)[permisoId] ?? null;
}

// Guarda también la diferencia con la hora del servidor, por si el reloj del celular está corrido.
export async function descargarQr(permisoId, token) {
  const { secreto, periodo, digitos, servidor_ahora: servidorAhora } = await obtenerQrSecreto(permisoId, token);
  escribir(CLAVE_QR, {
    ...leer(CLAVE_QR),
    [permisoId]: { secreto, periodo, digitos, desfaseMs: servidorAhora - Date.now() },
  });
}

export function leerServicio(permisoId) {
  return leer(CLAVE_SERVICIOS)[permisoId] ?? null;
}

// La foto y la bitácora no hacen falta sin señal y ocupan mucho espacio.
export function guardarServicio(servicio) {
  const { foto_evidencia_url: _foto, linea_tiempo: _bitacora, ...liviano } = servicio;
  escribir(CLAVE_SERVICIOS, { ...leer(CLAVE_SERVICIOS), [servicio.id]: liviano });
}

export function olvidarServicio(permisoId) {
  for (const clave of [CLAVE_QR, CLAVE_SERVICIOS]) {
    const { [permisoId]: _quitado, ...resto } = leer(clave);
    escribir(clave, resto);
  }
}

export function olvidarTodo() {
  escribir(CLAVE_QR, {});
  escribir(CLAVE_SERVICIOS, {});
}