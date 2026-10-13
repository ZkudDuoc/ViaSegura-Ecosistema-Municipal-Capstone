import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { listarPendientes, listarOperativos } from "../services/permisoService";
import { listarAbiertas } from "../services/panicoService";
import { listarInfracciones } from "../services/infraccionService";
import { useSocket } from "./SocketContext";

const ResumenContext = createContext(null);

const REFRESCO_MS = 30_000;

// Eventos que cambian lo que el operador tiene pendiente.
const EVENTOS = [
  "solicitud:nueva",
  "solicitud:aprobada",
  "solicitud:rechazada",
  "solicitud:revocada",
  "solicitud:suspendida",
  "solicitud:corregida",
  "panico:nuevo",
  "panico:pendiente",
];

// Datos para el Inicio y para los contadores del menú, pedidos una sola vez
// para todo el panel. Se refrescan solos cada 30 s y apenas llega un evento.
// Si una fuente falla, las demás se muestran igual (vale null).
export function ResumenProvider({ children }) {
  const [datos, setDatos] = useState({ permisos: null, operativos: null, alertas: null, multas: null });
  const [cargando, setCargando] = useState(true);
  const [actualizado, setActualizado] = useState(null);

  const recargar = useCallback(async () => {
    const [permisos, operativos, alertas, multas] = await Promise.allSettled([
      listarPendientes(),
      listarOperativos(),
      listarAbiertas(),
      listarInfracciones(),
    ]);
    const valor = (r) => (r.status === "fulfilled" ? r.value : null);
    setDatos({ permisos: valor(permisos), operativos: valor(operativos), alertas: valor(alertas), multas: valor(multas) });
    setActualizado(new Date());
    setCargando(false);
  }, []);

  useEffect(() => {
    recargar();
    const intervalo = setInterval(recargar, REFRESCO_MS);
    return () => clearInterval(intervalo);
  }, [recargar]);

  const socket = useSocket();
  useEffect(() => {
    if (!socket) return undefined;
    EVENTOS.forEach((evento) => socket.on(evento, recargar));
    return () => EVENTOS.forEach((evento) => socket.off(evento, recargar));
  }, [socket, recargar]);

  return (
    <ResumenContext.Provider value={{ ...datos, cargando, actualizado, recargar }}>{children}</ResumenContext.Provider>
  );
}

export function useResumen() {
  const ctx = useContext(ResumenContext);
  if (!ctx) throw new Error("useResumen debe usarse dentro de <ResumenProvider>");
  return ctx;
}