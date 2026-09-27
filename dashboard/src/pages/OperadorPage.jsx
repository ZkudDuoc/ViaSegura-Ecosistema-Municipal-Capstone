import { useEffect, useState } from "react";
import PanicoAlertas from "../components/PanicoAlertas";
import MapView from "../components/MapView";
import { listarPendientes, aprobarPermiso, revocarPermiso, listarOperativos } from "../services/permisoService";
import { getApiErrorMessage } from "../services/api";
import "./OperadorPage.css";

const RIESGO_CLASS = { Bajo: "riesgo-bajo", Medio: "riesgo-medio", Alto: "riesgo-alto" };
const ESTADOS_REVOCABLES = ["APROBADO", "ACTIVO", "ACTIVO_PENDIENTE_EVIDENCIA", "EN_COLA_ESPERA"];

const ESTADO_CLASS = {
  PENDIENTE_CONFIRMACION_MUNICIPAL: "estado-pendiente",
  APROBADO: "estado-aprobado",
  EN_COLA_ESPERA: "estado-cola",
  ACTIVO: "estado-activo",
  ACTIVO_PENDIENTE_EVIDENCIA: "estado-activo",
  FINALIZADO: "estado-finalizado",
  EXPIRADO: "estado-expirado",
  REVOCADO: "estado-revocado",
};

const MOTIVO_COLA_LABEL = {
  RIESGO_ALTO_SIN_MOVIL: "Riesgo alto — falta asignar móvil de escolta",
};

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

  const handleRevocar = async (id) => {
    const motivo = window.prompt("Motivo de la revocación (opcional):") ?? "";
    setError(null);
    setProcesandoId(id);
    try {
      await revocarPermiso(id, motivo || undefined);
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
                  No hay solicitudes pendientes
                </td>
              </tr>
            )}
            {solicitudes.map((s) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td>{s.nombre_empresa_ejecutora ?? s.empresa_ejecutora_id ?? "—"}</td>
                <td>
                  <span className={`riesgo-pill ${RIESGO_CLASS[s.riesgo] ?? "riesgo-medio"}`}>
                    {s.riesgo ?? "Sin evaluar"}
                  </span>
                </td>
                <td>
                  <span className={`estado-pill ${ESTADO_CLASS[s.estado] ?? ""}`}>
                    {s.estado.replaceAll("_", " ")}
                  </span>
                  {s.estado === "EN_COLA_ESPERA" && s.motivo_cola && (
                    <div className="motivo-cola-hint">
                      {MOTIVO_COLA_LABEL[s.motivo_cola] ?? s.motivo_cola}
                    </div>
                  )}
                </td>
                <td>
                  {s.estado === "PENDIENTE_CONFIRMACION_MUNICIPAL" ? (
                    <div className="acciones-cell">
                      <button
                        className="btn-secondary"
                        onClick={() => handleAprobar(s.id)}
                        disabled={procesandoId === s.id}
                      >
                        {procesandoId === s.id ? "Aprobando…" : "Aprobar"}
                      </button>
                      <button
                        className="btn-danger"
                        onClick={() => handleRevocar(s.id)}
                        disabled={procesandoId === s.id}
                      >
                        Revocar
                      </button>
                    </div>
                  ) : ESTADOS_REVOCABLES.includes(s.estado) ? (
                    <button
                      className="btn-danger"
                      onClick={() => handleRevocar(s.id)}
                      disabled={procesandoId === s.id}
                    >
                      {procesandoId === s.id ? "Revocando…" : "Revocar"}
                    </button>
                  ) : (
                    <span className="page-subtitle">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}