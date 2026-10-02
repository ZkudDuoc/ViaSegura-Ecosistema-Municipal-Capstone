import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { SOCKET_URL } from "../config";
import { useAuth } from "./AuthContext";

const SocketContext = createContext(null);

// Una sola conexión Socket.io para todo el dashboard (Bandeja, alertas de
// pánico, etc.). El Backend une al operador a la sala de su comuna con el token.
export function SocketProvider({ children }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      return undefined;
    }
    const conexion = io(SOCKET_URL, { auth: { token }, transports: ["websocket"] });
    setSocket(conexion);
    return () => conexion.disconnect();
  }, [token]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}

// Escucha un evento del socket mientras el componente esté montado.
// El handler puede cambiar en cada render sin volver a suscribirse.
export function useEventoSocket(evento, handler) {
  const socket = useSocket();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!socket) return undefined;
    const escuchar = (payload) => handlerRef.current(payload);
    socket.on(evento, escuchar);
    return () => socket.off(evento, escuchar);
  }, [socket, evento]);
}