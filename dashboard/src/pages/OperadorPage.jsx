import { useEffect, useState } from "react";
import MapView from "../components/MapView";
import { listarPendientes } from "../services/permisoService";
import "./OperadorPage.css";

const RIESGO_CLASS = { Bajo: "riesgo-bajo", Medio: "riesgo-medio", Alto: "riesgo-alto" };

export default function OperadorPage() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backendPendiente, setBackendPendiente] = useState(false);

  useEffect(() => {
    listarPendientes()
      .then((data) => setSolicitudes(data))
      .catch((err) => {
        // El Backend (Joshua) todavía no implementa GET /api/permisos —
        // se documenta como pendiente en vez de romper el panel.
        if ([404, 501].includes(err?.response?.status) || !err?.response) {
          setBackendPendiente(true);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1>Bandeja de decisiones</h1>
      <p className="page-subtitle">
        Conectado a <code>GET /api/permisos</code> del Backend Core.
      </p>

      <MapView height={360} />

      {loading && <p className="page-subtitle">Cargando solicitudes…</p>}

      {!loading && backendPendiente && (
        <p className="pending-banner">
          Pendiente: el Backend aún no expone <code>GET /api/permisos</code>. Esta tabla se
          poblará automáticamente apenas Joshua lo implemente — no requiere cambios en el
          dashboard.
        </p>
      )}

      {!loading && !backendPendiente && (
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
                  <button className="btn-secondary">Revisar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
