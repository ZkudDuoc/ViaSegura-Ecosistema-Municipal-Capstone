import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { SOCKET_URL } from "../config";
import { useAuth } from "../context/AuthContext";
import { obtenerPosicion } from "../utils/geo";
import "./paginas.css";

// Mismo contrato de WebSocket que usaba la app móvil:
//   emite "panico:enviar" -> { usuarioId, nombre, ubicacion: { lat, lng }, timestamp }
//   recibe "panico:confirmado" | "panico:error"
export default function PanicoPage() {
  const { usuario, token } = useAuth();
  const socketRef = useRef(null);
  const [estado, setEstado] = useState("idle"); // idle | enviando | confirmado | error
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: { token }, transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("panico:confirmado", () => {
      setEstado("confirmado");
      setMensaje("Alerta recibida por el centro de control");
    });
    socket.on("panico:error", (payload) => {
      setEstado("error");
      setMensaje(payload?.error ?? "El servidor rechazó la alerta");
    });
    socket.on("connect_error", () => {
      setEstado("error");
      setMensaje("No se pudo conectar con el servidor");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const enviarPanico = async () => {
    setEstado("enviando");
    setMensaje(null);
    try {
      const posicion = await obtenerPosicion();
      socketRef.current?.emit("panico:enviar", {
        usuarioId: usuario.id,
        nombre: usuario.nombre,
        ubicacion: { lat: posicion.lat, lng: posicion.lng },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      setEstado("error");
      setMensaje(err.message);
    }
  };

  return (
    <div className="panico">
      <h1>Botón de pánico</h1>
      <p className="subtitulo">Envía tu ubicación al centro de control. Requiere un permiso en operativo.</p>

      <button type="button" className="boton-sos" onClick={enviarPanico} disabled={estado === "enviando"}>
        {estado === "enviando" ? "…" : "SOS"}
      </button>

      {mensaje && <p className={estado === "error" ? "texto-error" : "texto-exito"}>{mensaje}</p>}
    </div>
  );
}