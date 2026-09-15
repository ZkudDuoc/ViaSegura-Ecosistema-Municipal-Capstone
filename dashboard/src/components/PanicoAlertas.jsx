import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { SOCKET_URL } from "../config";
import { useAuth } from "../context/AuthContext";
import { procesarColaLocal } from "../services/panicoService";
import "./PanicoAlertas.css";

// Cascada de resiliencia del pánico (Semana 3, backend): el servidor entrega
// la alerta por WebSocket en vivo ("panico:nuevo") si hay un operador
// conectado; si no, escala a SMS y por último a una cola local que se
// reenvía apenas el operador se conecta ("panico:pendiente"). El chofer
// nunca ve esta distinción — solo el operador, que es quien debe actuar.
export default function PanicoAlertas() {
  const { token } = useAuth();
  const [alertas, setAlertas] = useState([]);

  useEffect(() => {
    if (!token) return undefined;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket"],
    });

    const agregarAlerta = (origen) => (payload) => {
      setAlertas((prev) => [{ ...payload, origen }, ...prev]);
    };

    socket.on("panico:nuevo", agregarAlerta("live"));
    socket.on("panico:pendiente", agregarAlerta("cola_local"));

    return () => {
      socket.disconnect();
    };
  }, [token]);

  const handleAtender = async (alerta) => {
    if (!alerta.colaLocalId) return;
    try {
      await procesarColaLocal(alerta.colaLocalId);
      setAlertas((prev) => prev.filter((a) => a !== alerta));
    } catch (err) {
      // Si falla, la dejamos en la lista para reintentar — no hay banner de
      // error dedicado acá porque es un panel secundario, no el flujo principal.
      console.error("No se pudo marcar la alerta como atendida:", err);
    }
  };

  if (alertas.length === 0) return null;

  return (
    <div className="panico-alertas">
      {alertas.map((alerta, i) => (
        <div key={alerta.alertaId ?? alerta.colaLocalId ?? i} className="panico-alerta">
          <div>
            <strong>🚨 Pánico — {alerta.nombre ?? "Chofer"}</strong>
            <div className="panico-alerta-detalle">
              {alerta.origen === "cola_local"
                ? "Llegó por cola local (no había operador conectado ni SMS disponible)"
                : "Alerta en vivo"}
              {alerta.activadoEn && ` · ${new Date(alerta.activadoEn).toLocaleTimeString()}`}
            </div>
          </div>
          {alerta.colaLocalId && (
            <button className="btn-secondary" onClick={() => handleAtender(alerta)}>
              Marcar atendida
            </button>
          )}
        </div>
      ))}
    </div>
  );
}