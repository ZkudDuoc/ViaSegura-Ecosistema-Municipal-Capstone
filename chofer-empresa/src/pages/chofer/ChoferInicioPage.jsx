import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useChofer } from "../../context/ChoferContext";
import { obtenerServicio } from "../../services/choferApi";
import ServicioActual from "../../components/chofer/ServicioActual";
import BotonPanico from "../../components/chofer/BotonPanico";
import { ESTADO_LABEL, ESTADO_CLASE, formatearFecha } from "../../utils/formato";
import "../paginas.css";
import "../detalle.css";
import "./chofer.css";

const REFRESCO_MS = 20_000;
const ESTADOS_CERRADOS = ["FINALIZADO", "EXPIRADO", "REVOCADO", "RECHAZADO", "SUSPENDIDO"];

// Avisos cuando la municipalidad cambia el estado de un servicio.
// PENDIENTE (Backend): los eventos socket no llegan a la sesión de código;
// por ahora se detectan revisando cada REFRESCO_MS.
const AVISOS = {
  APROBADO: { texto: "La municipalidad aprobó tu servicio. Ya puedes iniciar el trabajo.", tono: "ok" },
  REVOCADO: { texto: "La municipalidad revocó el permiso de tu servicio. No sigas trabajando.", tono: "error" },
  RECHAZADO: { texto: "La municipalidad rechazó tu servicio.", tono: "error" },
  SUSPENDIDO: { texto: "Un supervisor suspendió la obra. Detén el trabajo.", tono: "error" },
};

// Un servicio pasa al historial cuando se cierra o cuando pasó su horario.
function esRealizado(s) {
  return ESTADOS_CERRADOS.includes(s.estado) || new Date(s.ventana_fin) < new Date();
}

// El actual es el que está en curso; si no hay, el próximo por horario.
function ordenarPendientes(a, b) {
  const enCursoA = a.estado.startsWith("ACTIVO") ? 0 : 1;
  const enCursoB = b.estado.startsWith("ACTIVO") ? 0 : 1;
  if (enCursoA !== enCursoB) return enCursoA - enCursoB;
  return new Date(a.ventana_inicio) - new Date(b.ventana_inicio);
}

function MiniServicio({ servicio }) {
  return (
    <li className="mini-servicio">
      <div>
        <strong>
          {servicio.tipo_actividad === "EMERGENCIA" ? "Emergencia" : "Programado"} ·{" "}
          {servicio.id.slice(0, 8).toUpperCase()}
        </strong>
        <span className="permiso-detalle">{formatearFecha(servicio.ventana_inicio)}</span>
      </div>
      <span className={`badge ${ESTADO_CLASE[servicio.estado] ?? ""}`}>
        {ESTADO_LABEL[servicio.estado] ?? servicio.estado}
      </span>
    </li>
  );
}

export default function ChoferInicioPage() {
  const { sesiones, quitarServicio, salir, tokenDe } = useChofer();
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState(null);
  const [pestana, setPestana] = useState("PENDIENTES");
  const estadosPrevios = useRef({});

  const cargar = useCallback(async () => {
    const resultados = await Promise.allSettled(sesiones.map((s) => obtenerServicio(s.permisoId, s.token)));
    const cargados = [];
    resultados.forEach((resultado, i) => {
      const { permisoId } = sesiones[i];
      if (resultado.status === "fulfilled") {
        const servicio = resultado.value;
        const anterior = estadosPrevios.current[permisoId];
        if (anterior && anterior !== servicio.estado && AVISOS[servicio.estado]) setAviso(AVISOS[servicio.estado]);
        estadosPrevios.current[permisoId] = servicio.estado;
        cargados.push(servicio);
      } else if (resultado.reason?.response?.status === 401) {
        // El código venció (12 h): se quita de la lista.
        quitarServicio(permisoId);
      }
    });
    setServicios(cargados);
    setCargando(false);
  }, [sesiones, quitarServicio]);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(intervalo);
  }, [cargar]);

  if (sesiones.length === 0) return <Navigate to="/chofer" replace />;

  const vigentes = servicios.filter((s) => !esRealizado(s)).sort(ordenarPendientes);
  const realizados = servicios
    .filter(esRealizado)
    .sort((a, b) => new Date(b.ventana_fin) - new Date(a.ventana_fin));
  const actual = vigentes[0] ?? null;
  const pendientes = vigentes.slice(1);

  return (
    <div className="chofer-app">
      <header className="chofer-header">
        <strong className="app-brand">VíaSegura</strong>
        <div className="chofer-header-acciones">
          <Link to="/chofer" className="btn-link">
            Agregar código
          </Link>
          <button type="button" className="btn-link" onClick={salir}>
            Salir
          </button>
        </div>
      </header>

      <main className="chofer-contenido">
        {aviso && (
          <div className={`chofer-aviso ${aviso.tono}`} role="status">
            <span>{aviso.texto}</span>
            <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso">
              ×
            </button>
          </div>
        )}

        <section className="chofer-mitad">
          <h1>Servicio actual</h1>
          {cargando && <p className="subtitulo">Cargando…</p>}
          {!cargando && actual && (
            <ServicioActual servicio={actual} token={tokenDe(actual.id)} onActualizado={cargar} />
          )}
          {!cargando && !actual && (
            <div className="card vacio">No tienes un servicio en curso. Si tu empresa te envió otro código, agrégalo.</div>
          )}

          {actual && (
            <div className="card chofer-panico">
              <BotonPanico token={tokenDe(actual.id)} />
            </div>
          )}
        </section>

        <section className="chofer-mitad">
          <div className="bandeja-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={pestana === "PENDIENTES"}
              className={"chip" + (pestana === "PENDIENTES" ? " activo" : "")}
              onClick={() => setPestana("PENDIENTES")}
            >
              Pendientes ({pendientes.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={pestana === "REALIZADOS"}
              className={"chip" + (pestana === "REALIZADOS" ? " activo" : "")}
              onClick={() => setPestana("REALIZADOS")}
            >
              Realizados ({realizados.length})
            </button>
          </div>

          {pestana === "PENDIENTES" &&
            (pendientes.length ? (
              <ul className="mini-lista">
                {pendientes.map((s) => (
                  <MiniServicio key={s.id} servicio={s} />
                ))}
              </ul>
            ) : (
              <p className="permiso-detalle">No tienes más servicios pendientes.</p>
            ))}

          {pestana === "REALIZADOS" &&
            (realizados.length ? (
              <ul className="mini-lista">
                {realizados.map((s) => (
                  <MiniServicio key={s.id} servicio={s} />
                ))}
              </ul>
            ) : (
              <p className="permiso-detalle">Todavía no hay servicios realizados.</p>
            ))}
        </section>
      </main>
    </div>
  );
}