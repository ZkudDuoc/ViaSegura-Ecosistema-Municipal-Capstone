import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { SOCKET_URL } from "../../config";
import { obtenerPosicion } from "../../utils/geo";

const MANTENER_MS = 2000;
const ESPERA_CONFIRMACION_MS = 10_000;

// Pánico del chofer: hay que mantener presionado 2 s (evita toques accidentales).
// Si en 10 s no llega la confirmación, se ofrece llamar al 133.
// El Backend identifica el servicio por el token del código, no por lo que envía la app.
export default function BotonPanico({ token }) {
  const socketRef = useRef(null);
  const presionRef = useRef(null);
  const esperaRef = useRef(null);
  const [estado, setEstado] = useState("idle"); // idle | presionando | enviando | confirmado | sin_confirmar | error
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: { token }, transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("panico:confirmado", () => {
      clearTimeout(esperaRef.current);
      setEstado("confirmado");
      setMensaje("Alerta recibida por la municipalidad. Mantén la calma, van en camino.");
    });
    socket.on("panico:error", (payload) => {
      clearTimeout(esperaRef.current);
      setEstado("error");
      setMensaje(payload?.error ?? "No se pudo enviar la alerta.");
    });

    return () => {
      clearTimeout(presionRef.current);
      clearTimeout(esperaRef.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const enviar = async () => {
    setEstado("enviando");
    setMensaje("Obteniendo tu ubicación…");
    try {
      const posicion = await obtenerPosicion();
      socketRef.current?.emit("panico:enviar", {
        ubicacion: { lat: posicion.lat, lng: posicion.lng },
        timestamp: new Date().toISOString(),
      });
      setMensaje("Enviando alerta…");
      esperaRef.current = setTimeout(() => {
        setEstado("sin_confirmar");
        setMensaje("No se confirmó la alerta.");
      }, ESPERA_CONFIRMACION_MS);
    } catch (err) {
      setEstado("error");
      setMensaje(err.message);
    }
  };

  const empezar = (e) => {
    if (estado === "enviando" || estado === "presionando") return;
    e.preventDefault();
    setEstado("presionando");
    setMensaje(null);
    presionRef.current = setTimeout(enviar, MANTENER_MS);
  };

  const soltar = () => {
    if (estado !== "presionando") return;
    clearTimeout(presionRef.current);
    setEstado("idle");
  };

  const texto = { presionando: "Mantén…", enviando: "Enviando…", confirmado: "Enviada" }[estado] ?? "SOS";

  return (
    <div className="panico-chofer">
      <button
        type="button"
        className={`boton-sos-chofer ${estado}`}
        onPointerDown={empezar}
        onPointerUp={soltar}
        onPointerLeave={soltar}
        onPointerCancel={soltar}
        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && empezar(e)}
        onKeyUp={soltar}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Botón de pánico: mantén presionado 2 segundos"
      >
        <span className="sos-relleno" aria-hidden="true" />
        <span className="sos-texto">{texto}</span>
      </button>
      <p className="panico-ayuda">Mantén presionado 2 segundos para pedir ayuda</p>

      {mensaje && (
        <p className={["error", "sin_confirmar"].includes(estado) ? "texto-error" : "texto-exito"} role="status">
          {mensaje}
        </p>
      )}

      {["error", "sin_confirmar"].includes(estado) && (
        <a href="tel:133" className="btn-llamar">
          Llamar al 133 (Carabineros)
        </a>
      )}
    </div>
  );
}