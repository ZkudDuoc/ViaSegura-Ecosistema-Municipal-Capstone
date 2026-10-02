import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { canjearCodigo } from "../services/choferApi";

const ChoferContext = createContext(null);

const CLAVE = "viasegura_chofer_servicios";

// El token del código es un JWT con vencimiento (12 h en el Backend).
function venceEn(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.exp * 1000;
  } catch {
    return 0;
  }
}

function leerSesiones() {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    return lista.filter((s) => venceEn(s.token) > Date.now());
  } catch {
    return [];
  }
}

function guardarSesiones(lista) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    // Sin storage disponible, los servicios duran solo mientras la pestaña esté abierta.
  }
}

// Cada código canjeado da acceso a UN servicio: el dispositivo del chofer
// guarda todos los que ha canjeado para mostrar actual, pendientes e historial.
export function ChoferProvider({ children }) {
  const [sesiones, setSesiones] = useState(leerSesiones);

  useEffect(() => {
    guardarSesiones(sesiones);
  }, [sesiones]);

  const agregarCodigo = useCallback(async (codigo) => {
    const limpio = codigo.trim().toLowerCase().replace(/\s/g, "");
    const { token, permiso_id: permisoId } = await canjearCodigo(limpio);
    setSesiones((previas) => [...previas.filter((s) => s.permisoId !== permisoId), { permisoId, token }]);
    return permisoId;
  }, []);

  const quitarServicio = useCallback((permisoId) => {
    setSesiones((previas) => previas.filter((s) => s.permisoId !== permisoId));
  }, []);

  const salir = useCallback(() => setSesiones([]), []);

  const tokenDe = useCallback((permisoId) => sesiones.find((s) => s.permisoId === permisoId)?.token ?? null, [sesiones]);

  return (
    <ChoferContext.Provider value={{ sesiones, agregarCodigo, quitarServicio, salir, tokenDe }}>
      {children}
    </ChoferContext.Provider>
  );
}

export function useChofer() {
  const ctx = useContext(ChoferContext);
  if (!ctx) throw new Error("useChofer debe usarse dentro de <ChoferProvider>");
  return ctx;
}