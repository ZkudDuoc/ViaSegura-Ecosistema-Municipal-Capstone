import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PanicoAlertas from "../components/PanicoAlertas";
import MapView from "../components/MapView";
import { listarPendientes, aprobarPermiso, listarOperativos } from "../services/permisoService";
import { getApiErrorMessage } from "../services/api";
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

export default function OperadorPage() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesandoId, setProcesandoId] = useState(null);
  const [error, setError] = useState(null);
  const [operativos, setOperativos] = useState([]);

  const cargar = () => listarPendientes().then(setSolicitudes);

  useEffect(() => {
    cargar()
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

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
      <h1>Bandeja de decisiones</h1>
      <PanicoAlertas />
      <MapView height={360} operativos={operativos} />
      <div className="operativos-leyenda">
        <span className="leyenda-gradiente" />
        <span>Recién iniciado</span>
        <span className="leyenda-separador">→</span>
        <span>Por terminar</span>
      </div>

      {loading && <p className="page-subtitle">Cargando solicitudes…</p>}
      {error && <p className="pending-banner error-banner">{error}</p>}

      {!loading && (
        <table className="solicitudes-table">
          <thead>
            <tr>
              <th>Solicitud</th>
              <th>Empresa</th>
              <th>Riesgo</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {solicitudes.length === 0 && (
              <tr>
                <td colSpan={5} className="page-subtitle">
                  No hay solicitudes
                </td>
              </tr>
            )}
            {solicitudes.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link to={`/solicitudes/${s.id}`} className="link-detalle">
                    {codigoCorto(s.id)}
                  </Link>
                </td>
                <td>{s.nombre_empresa_ejecutora ?? "—"}</td>
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
      )}
    </div>
  );
}