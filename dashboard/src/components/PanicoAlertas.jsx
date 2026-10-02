import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSocket, useEventoSocket } from "../context/SocketContext";
import { listarAbiertas, atenderAlerta, procesarColaLocal } from "../services/panicoService";
import { getApiErrorMessage } from "../services/api";
import "./PanicoAlertas.css";

const REFRESCO_MS = 60_000;
const TICK_MS = 30_000;
const TITULO_BASE = document.title;

// Normaliza las dos fuentes de alertas a una sola forma:
//  - GET /panico/abiertas (persisten aunque se recargue la página)
//  - socket "panico:nuevo" / "panico:pendiente" (en vivo, traen el vehículo)
function desdeApi(a) {
  const [lng, lat] = a.ubicacion?.coordinates ?? [];
  return {
    id: a.id,
    permisoId: a.permiso_id,
    nombre: a.nombre,
    rut: a.rut_ejecutor,
    vehiculo: undefined, // el listado no trae el vehículo: se ve en la solicitud
    ubicacion: lat != null ? { lat, lng } : null,
    activadoEn: a.activado_at,
    colaLocalId: null,
  };
}

function desdeSocket(p) {
  return {
    id: p.alertaId,
    permisoId: p.permisoId,
    nombre: p.nombre,
    rut: p.rutEjecutor,
    vehiculo: p.vehiculo ?? null,
    ubicacion: p.ubicacion ?? null,
    activadoEn: p.activadoEn,
    colaLocalId: p.colaLocalId ?? null,
  };
}

// Agrega o actualiza una alerta sin perder datos que solo trae una de las fuentes.
function fusionar(lista, nueva) {
  const existente = lista.find((a) => a.id === nueva.id);
  if (!existente) return [nueva, ...lista];
  const conValor = Object.fromEntries(Object.entries(nueva).filter(([, v]) => v != null));
  return lista.map((a) => (a.id === nueva.id ? { ...a, ...conValor } : a));
}

function formatearVehiculo(vehiculo) {
  if (vehiculo === undefined) return "Ver en la solicitud";
  if (!vehiculo) return "Sin vehículo asociado";
  return `${vehiculo.patente} · ${vehiculo.largo_m} × ${vehiculo.ancho_m} m · ${vehiculo.alto_m} m alto`;
}

function haceCuanto(iso) {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return "hace menos de 1 min";
  if (minutos < 60) return `hace ${minutos} min`;
  return `hace ${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

// Tres pitidos generados con Web Audio (sin archivo de sonido). El navegador
// solo deja sonar después de que el usuario haya hecho algún clic en la página.
let audioCtx = null;
function sonarAlarma() {
  try {
    audioCtx = audioCtx ?? new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const inicio = audioCtx.currentTime;
    [0, 0.35, 0.7].forEach((desfase) => {
      const oscilador = audioCtx.createOscillator();
      const volumen = audioCtx.createGain();
      oscilador.type = "square";
      oscilador.frequency.value = 880;
      volumen.gain.setValueAtTime(0.0001, inicio + desfase);
      volumen.gain.exponentialRampToValueAtTime(0.2, inicio + desfase + 0.02);
      volumen.gain.exponentialRampToValueAtTime(0.0001, inicio + desfase + 0.25);
      oscilador.connect(volumen).connect(audioCtx.destination);
      oscilador.start(inicio + desfase);
      oscilador.stop(inicio + desfase + 0.3);
    });
  } catch {
    // Sin audio disponible: la alerta visual y la notificación siguen funcionando.
  }
}

function notificar(alerta) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const notificacion = new Notification("Alerta de pánico", {
    body: `${alerta.nombre ?? "Un chofer"} pidió ayuda${alerta.rut ? ` · RUT ${alerta.rut}` : ""}`,
    requireInteraction: true,
    tag: alerta.id,
  });
  notificacion.onclick = () => {
    window.focus();
    notificacion.close();
  };
}

export default function PanicoAlertas() {
  const socket = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [alertas, setAlertas] = useState([]);
  const [atendiendoId, setAtendiendoId] = useState(null);
  const [error, setError] = useState(null);
  const [permisoNotificacion, setPermisoNotificacion] = useState(() =>
    "Notification" in window ? Notification.permission : "unsupported"
  );
  const [, setTick] = useState(0);

  // Las alertas abiertas del Backend son la fuente de verdad: una que ya no
  // está (la atendió otro operador) se quita de la lista.
  const cargar = useCallback(
    () =>
      listarAbiertas()
        .then((lista) =>
          setAlertas((previas) => {
            const abiertas = new Set(lista.map((a) => a.id));
            return lista.map(desdeApi).reduce(fusionar, previas.filter((a) => abiertas.has(a.id)));
          })
        )
        .catch(() => {}),
    []
  );

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(intervalo);
  }, [cargar]);

  // Si la conexión se cae y vuelve, se recuperan las alertas que llegaron mientras tanto.
  useEffect(() => {
    if (!socket) return undefined;
    socket.on("connect", cargar);
    return () => socket.off("connect", cargar);
  }, [socket, cargar]);

  // Refresca el "hace X min" sin esperar datos nuevos.
  useEffect(() => {
    const intervalo = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    document.title = alertas.length ? `(${alertas.length}) ¡Alerta de pánico! · ${TITULO_BASE}` : TITULO_BASE;
    return () => {
      document.title = TITULO_BASE;
    };
  }, [alertas.length]);

  const verEnMapa = (alerta) => {
    if (!alerta.ubicacion) return;
    navigate("/operador", { state: { foco: { ...alerta.ubicacion, clave: alerta.id } } });
  };

  const recibir = (payload) => {
    const alerta = desdeSocket(payload);
    if (!alerta.id) return;
    setAlertas((previas) => fusionar(previas, alerta));
    sonarAlarma();
    notificar(alerta);
    // Solo se mueve el mapa si el operador ya está en la Bandeja: no se le
    // saca de la página en que está trabajando.
    if (location.pathname === "/operador") verEnMapa(alerta);
  };
  useEventoSocket("panico:nuevo", recibir);
  useEventoSocket("panico:pendiente", recibir);

  const atender = async (alerta) => {
    setError(null);
    setAtendiendoId(alerta.id);
    try {
      await atenderAlerta(alerta.id);
      // Las que llegaron por cola local también se marcan ahí, para que no se reenvíen.
      if (alerta.colaLocalId) await procesarColaLocal(alerta.colaLocalId).catch(() => {});
      setAlertas((previas) => previas.filter((a) => a.id !== alerta.id));
    } catch (err) {
      if (err?.response?.status === 409) {
        // Ya la atendió otro operador.
        setAlertas((previas) => previas.filter((a) => a.id !== alerta.id));
      } else {
        setError(getApiErrorMessage(err));
      }
    } finally {
      setAtendiendoId(null);
    }
  };

  const pedirPermisoNotificaciones = async () => {
    const resultado = await Notification.requestPermission();
    setPermisoNotificacion(resultado);
  };

  if (alertas.length === 0 && permisoNotificacion !== "default") return null;

  return (
    <div className="panico-alertas">
      {permisoNotificacion === "default" && (
        <div className="panico-permiso">
          <span>Activa las notificaciones para enterarte de una alerta de pánico aunque estés en otra pestaña.</span>
          <button type="button" className="btn-secondary" onClick={pedirPermisoNotificaciones}>
            Activar notificaciones
          </button>
        </div>
      )}

      {error && <p className="pending-banner error-banner">{error}</p>}

      {alertas.map((alerta) => (
        <div key={alerta.id} className="panico-alerta" role="alert">
          <div className="panico-alerta-info">
            <strong>Pánico: {alerta.nombre ?? "Chofer"}</strong>
            <div className="panico-alerta-detalle">
              {alerta.colaLocalId ? "Llegó por cola local (no había operador conectado)" : "Alerta abierta"}
              {alerta.activadoEn &&
                ` · ${new Date(alerta.activadoEn).toLocaleTimeString("es-CL")} (${haceCuanto(alerta.activadoEn)})`}
            </div>

            <dl className="panico-alerta-datos">
              <div>
                <dt>RUT</dt>
                <dd>{alerta.rut ?? "—"}</dd>
              </div>
              <div>
                <dt>Vehículo</dt>
                <dd>{formatearVehiculo(alerta.vehiculo)}</dd>
              </div>
              <div>
                <dt>Ubicación</dt>
                <dd>
                  {alerta.ubicacion ? (
                    <a
                      href={`https://www.google.com/maps?q=${alerta.ubicacion.lat},${alerta.ubicacion.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {alerta.ubicacion.lat.toFixed(5)}, {alerta.ubicacion.lng.toFixed(5)}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="panico-acciones">
            {alerta.ubicacion && (
              <button type="button" className="btn-secondary" onClick={() => verEnMapa(alerta)}>
                Ver en el mapa
              </button>
            )}
            {alerta.permisoId && (
              <Link to={`/solicitudes/${alerta.permisoId}`} className="btn-secondary">
                Ver solicitud
              </Link>
            )}
            <button
              type="button"
              className="btn-danger"
              onClick={() => atender(alerta)}
              disabled={atendiendoId === alerta.id}
            >
              {atendiendoId === alerta.id ? "Guardando…" : "Marcar atendida"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}