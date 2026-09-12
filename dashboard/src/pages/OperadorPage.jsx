import { useEffect, useState } from "react";
import MapView from "../components/MapView";
import { listarPendientes, aprobarPermiso } from "../services/permisoService";
import { getApiErrorMessage } from "../services/api";
import "./OperadorPage.css";

const RIESGO_CLASS = { Bajo: "riesgo-bajo", Medio: "riesgo-medio", Alto: "riesgo-alto" };

export default function OperadorPage() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesandoId, setProcesandoId] = useState(null);
  const [error, setError] = useState(null);

  const cargar = () => listarPendientes().then(setSolicitudes);

  useEffect(() => {
    cargar()
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
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

  return (
    <div>
      <h1>Bandeja de decisiones</h1>
      <p className="page-subtitle">
        Conectado a <code>GET /api/permisos</code> del Backend Core.
      </p>

      <MapView height={360} />

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
                <td>{s.estado}</td>
                <td>
                  {s.estado === "PENDIENTE_CONFIRMACION_MUNICIPAL" ? (
                    <button
                      className="btn-secondary"
                      onClick={() => handleAprobar(s.id)}
                      disabled={procesandoId === s.id}
                    >
                      {procesandoId === s.id ? "Aprobando…" : "Aprobar"}
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
