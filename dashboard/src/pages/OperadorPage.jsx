import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import MapView from "../components/MapView";
import { listarPendientes, aprobarPermiso, listarOperativos } from "../services/permisoService";
import { getApiErrorMessage } from "../services/api";
import { useEventoSocket } from "../context/SocketContext";
import CallesRiesgoControl, { useCapaCalles } from "../components/CallesRiesgoControl";
import {
  ESTADO_LABEL,
  ESTADO_CLASS,
  RIESGO_CLASS,
  MOTIVO_COLA_LABEL,
  ESTADOS_APROBABLES,
  codigoCorto,
} from "../utils/permisos";
import "./OperadorPage.css";
import "./SolicitudDetallePage.css";

const REFRESCO_OPERATIVOS_MS = 30_000;
const DURACION_AVISO_MS = 8000;

const GRUPOS_ESTADO = {
  POR_DECIDIR: ["PENDIENTE_CONFIRMACION_MUNICIPAL", "EN_COLA_ESPERA"],
  EN_TERRENO: ["ACTIVO", "ACTIVO_PENDIENTE_EVIDENCIA", "SUSPENDIDO"],
  APROBADAS: ["APROBADO"],
  CERRADAS: ["FINALIZADO", "EXPIRADO", "REVOCADO", "RECHAZADO"],
};
const ORDEN_GRUPOS = ["POR_DECIDIR", "EN_TERRENO", "APROBADAS", "CERRADAS"];

const PESTANAS = [
  { value: "TODAS", label: "Todas" },
  { value: "POR_DECIDIR", label: "Por decidir" },
  { value: "EN_TERRENO", label: "En terreno" },
  { value: "APROBADAS", label: "Aprobadas" },
  { value: "CERRADAS", label: "Cerradas" },
];

const PESO_RIESGO = { Alto: 0, Medio: 1, Bajo: 2 };

function grupoDe(estado) {
  return ORDEN_GRUPOS.find((g) => GRUPOS_ESTADO[g].includes(estado)) ?? "CERRADAS";
}

// Prioridad: primero lo que requiere decisión; dentro de cada grupo,
// emergencias y riesgo alto primero. Lo pendiente va del más antiguo al más
// nuevo (nadie queda esperando); el resto, del más reciente al más antiguo.
function compararPrioridad(a, b) {
  const grupoA = grupoDe(a.estado);
  const grupoB = grupoDe(b.estado);
  if (grupoA !== grupoB) return ORDEN_GRUPOS.indexOf(grupoA) - ORDEN_GRUPOS.indexOf(grupoB);

  const emergenciaA = a.tipo_actividad === "EMERGENCIA" ? 0 : 1;
  const emergenciaB = b.tipo_actividad === "EMERGENCIA" ? 0 : 1;
  if (emergenciaA !== emergenciaB) return emergenciaA - emergenciaB;

  const riesgoA = PESO_RIESGO[a.riesgo] ?? 3;
  const riesgoB = PESO_RIESGO[b.riesgo] ?? 3;
  if (riesgoA !== riesgoB) return riesgoA - riesgoB;

  const antiguedad = new Date(a.created_at) - new Date(b.created_at);
  return grupoA === "POR_DECIDIR" ? antiguedad : -antiguedad;
}

// Compara sin espacios, puntos ni guiones: "12.345.678-9" encuentra "123456789".
function normalizar(texto) {
  return String(texto ?? "").toLowerCase().replace(/[\s.-]/g, "");
}

function coincideBusqueda(s, busqueda) {
  const q = normalizar(busqueda);
  if (!q) return true;
  // `patente` llegará en la lista cuando el Backend la incluya (pendiente Joshua).
  return [s.rut_ejecutor, s.nombre_empresa_ejecutora, s.patente, codigoCorto(s.id)].some((campo) =>
    normalizar(campo).includes(q)
  );
}

function formatearRecibida(iso) {
  return new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function OperadorPage() {
  const location = useLocation();
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesandoId, setProcesandoId] = useState(null);
  const [error, setError] = useState(null);
  const [operativos, setOperativos] = useState([]);
  const [aviso, setAviso] = useState(null);
  const [foco, setFoco] = useState(null);
    const capaCalles = useCapaCalles();

  const [pestana, setPestana] = useState("TODAS");
  const [riesgo, setRiesgo] = useState("TODOS");
  const [tipo, setTipo] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");

  const cargar = useCallback(() => listarPendientes().then(setSolicitudes), []);

  useEffect(() => {
    cargar()
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [cargar]);

  // Una alerta de pánico pide centrar el mapa en su ubicación (ver PanicoAlertas).
  useEffect(() => {
    const destino = location.state?.foco;
    if (!destino) return;
    setFoco(destino);
    document.getElementById("mapa-bandeja")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [location.state]);

  // Servicios en curso para la animación del mapa. Si falla, el mapa queda
  // sin marcadores pero la bandeja sigue funcionando.
  useEffect(() => {
    const cargarOperativos = () =>
      listarOperativos()
        .then(setOperativos)
        .catch(() => {});
    cargarOperativos();
    const id = setInterval(cargarOperativos, REFRESCO_OPERATIVOS_MS);
    return () => clearInterval(id);
  }, []);

  // Tiempo real: cualquier cambio de una solicitud de la comuna recarga la bandeja.
  const recargar = () => {
    cargar().catch(() => {});
  };
  useEventoSocket("solicitud:nueva", (permiso) => {
    recargar();
    const esEmergencia = permiso?.tipo_actividad === "EMERGENCIA";
    setAviso({
      texto: `Nueva solicitud ${permiso?.id ? codigoCorto(permiso.id) : ""}${esEmergencia ? " · EMERGENCIA" : ""}`,
      urgente: esEmergencia,
    });
  });
  useEventoSocket("solicitud:aprobada", recargar);
  useEventoSocket("solicitud:rechazada", recargar);
  useEventoSocket("solicitud:revocada", recargar);
  useEventoSocket("solicitud:suspendida", recargar);

  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), DURACION_AVISO_MS);
    return () => clearTimeout(t);
  }, [aviso]);

  const conteoPorGrupo = useMemo(() => {
    const conteo = { TODAS: solicitudes.length };
    ORDEN_GRUPOS.forEach((g) => {
      conteo[g] = solicitudes.filter((s) => grupoDe(s.estado) === g).length;
    });
    return conteo;
  }, [solicitudes]);

  const visibles = useMemo(
    () =>
      solicitudes
        .filter((s) => pestana === "TODAS" || grupoDe(s.estado) === pestana)
        .filter((s) => riesgo === "TODOS" || (riesgo === "SIN" ? !s.riesgo : s.riesgo === riesgo))
        .filter((s) => tipo === "TODOS" || s.tipo_actividad === tipo)
        .filter((s) => coincideBusqueda(s, busqueda))
        .sort(compararPrioridad),
    [solicitudes, pestana, riesgo, tipo, busqueda]
  );

  const hayFiltros = riesgo !== "TODOS" || tipo !== "TODOS" || busqueda.trim() !== "";

  const limpiarFiltros = () => {
    setRiesgo("TODOS");
    setTipo("TODOS");
    setBusqueda("");
  };

  // Aprobación rápida sin comentario. Rechazar y revocar piden motivo: se hacen desde el detalle.
  const handleAprobar = async (id) => {
    setError(null);
    setProcesandoId(id);
    try {
      await aprobarPermiso(id);
      await cargar();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setProcesandoId(null);
    }
  };

  return (
    <div>
      <div className="bandeja-encabezado">
        <h1>Bandeja de decisiones</h1>
        <span className="en-vivo">Actualización en vivo</span>
      </div>

      {aviso && (
        <div className={"aviso-vivo" + (aviso.urgente ? " urgente" : "")} role="status">
          {aviso.texto}
          <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      )}

            <CallesRiesgoControl {...capaCalles.control} />
      <div id="mapa-bandeja">
        <MapView
          height={360}
          operativos={operativos}
          foco={foco}
          calles={capaCalles.features}
          colorCallesPor={capaCalles.colorPor}
        />
      </div>
      <div className="operativos-leyenda">
        <span className="leyenda-gradiente" />
        <span>Recién iniciado</span>
        <span className="leyenda-separador">→</span>
        <span>Por terminar</span>
      </div>

      <div className="bandeja-pestanas" role="tablist" aria-label="Filtrar por estado">
        {PESTANAS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="tab"
            aria-selected={pestana === p.value}
            className={"bandeja-pestana" + (pestana === p.value ? " activa" : "")}
            onClick={() => setPestana(p.value)}
          >
            {p.label}
            <span className="bandeja-contador">{conteoPorGrupo[p.value] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="bandeja-filtros">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por RUT, empresa, código o patente"
          aria-label="Buscar solicitudes"
        />
        <select value={riesgo} onChange={(e) => setRiesgo(e.target.value)} aria-label="Filtrar por riesgo">
          <option value="TODOS">Todo riesgo</option>
          <option value="Alto">Riesgo alto</option>
          <option value="Medio">Riesgo medio</option>
          <option value="Bajo">Riesgo bajo</option>
          <option value="SIN">Sin evaluar</option>
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Filtrar por tipo">
          <option value="TODOS">Todo tipo</option>
          <option value="EMERGENCIA">Emergencias</option>
          <option value="PROGRAMADA">Programadas</option>
        </select>
        {hayFiltros && (
          <button type="button" className="btn-secondary" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        )}
      </div>

      {loading && <p className="page-subtitle">Cargando solicitudes…</p>}
      {error && <p className="pending-banner error-banner">{error}</p>}

      {!loading && (
        <>
          <p className="bandeja-resumen">
            Mostrando {visibles.length} de {solicitudes.length} solicitudes · ordenadas por prioridad
          </p>
          <table className="solicitudes-table">
            <thead>
              <tr>
                <th>Solicitud</th>
                <th>Empresa / RUT</th>
                <th>Riesgo</th>
                <th>Estado</th>
                <th>Recibida</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={6} className="page-subtitle">
                    {solicitudes.length === 0 ? "No hay solicitudes" : "Ninguna solicitud coincide con los filtros"}
                  </td>
                </tr>
              )}
              {visibles.map((s) => (
                <tr key={s.id} className={s.tipo_actividad === "EMERGENCIA" ? "fila-emergencia" : undefined}>
                  <td>
                    <Link to={`/solicitudes/${s.id}`} className="link-detalle">
                      {codigoCorto(s.id)}
                    </Link>
                    {s.tipo_actividad === "EMERGENCIA" && <span className="badge-emergencia">Emergencia</span>}
                  </td>
                  <td>
                    <div>{s.nombre_empresa_ejecutora ?? "Persona natural"}</div>
                    <div className="celda-sub">{s.rut_ejecutor}</div>
                  </td>
                  <td>
                    <span className={`riesgo-pill ${RIESGO_CLASS[s.riesgo] ?? "riesgo-medio"}`}>
                      {s.riesgo ?? "Sin evaluar"}
                    </span>
                  </td>
                  <td>
                    <span className={`estado-pill ${ESTADO_CLASS[s.estado] ?? ""}`}>
                      {ESTADO_LABEL[s.estado] ?? s.estado}
                    </span>
                    {s.estado === "EN_COLA_ESPERA" && s.motivo_cola && (
                      <div className="motivo-cola-hint">{MOTIVO_COLA_LABEL[s.motivo_cola] ?? s.motivo_cola}</div>
                    )}
                  </td>
                  <td className="celda-sub">{formatearRecibida(s.created_at)}</td>
                  <td>
                    <div className="acciones-cell">
                      {ESTADOS_APROBABLES.includes(s.estado) && (
                        <button
                          className="btn-secondary"
                          onClick={() => handleAprobar(s.id)}
                          disabled={procesandoId === s.id}
                        >
                          {procesandoId === s.id ? "Aprobando…" : "Aprobar"}
                        </button>
                      )}
                      <Link to={`/solicitudes/${s.id}`} className="btn-secondary">
                        Ver detalle
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}