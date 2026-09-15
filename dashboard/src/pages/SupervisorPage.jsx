import { useEffect, useMemo, useState } from "react";
import { listarPendientes } from "../services/permisoService";
import { getApiErrorMessage } from "../services/api";
import "./SupervisorPage.css";

const ESTADOS_APROBADOS = ["APROBADO", "ACTIVO", "ACTIVO_PENDIENTE_EVIDENCIA", "FINALIZADO"];

// Tiempo de evaluación aproximado: diferencia entre creación y última
// actualización de permisos que ya salieron de PENDIENTE_CONFIRMACION_MUNICIPAL.
// No es un dato exacto (no hay un timestamp de "momento de evaluación"
// dedicado todavía del lado del Backend), pero da una métrica real en vez
// de un mock fijo.
function calcularMetricas(permisos) {
  const total = permisos.length;
  const aprobadas = permisos.filter((p) => ESTADOS_APROBADOS.includes(p.estado)).length;
  const rechazadasORiesgoAlto = permisos.filter(
    (p) => p.estado === "REVOCADO" || p.riesgo === "Alto"
  ).length;

  const evaluados = permisos.filter((p) => p.estado !== "PENDIENTE_CONFIRMACION_MUNICIPAL");
  const horasPromedio =
    evaluados.length === 0
      ? null
      : evaluados.reduce((acc, p) => {
          const horas = (new Date(p.updated_at) - new Date(p.created_at)) / 3_600_000;
          return acc + horas;
        }, 0) / evaluados.length;

  return [
    { label: "Solicitudes totales", value: String(total) },
    { label: "Aprobadas", value: String(aprobadas) },
    { label: "Rechazadas / Riesgo alto", value: String(rechazadasORiesgoAlto) },
    {
      label: "Tiempo promedio de evaluación",
      value: horasPromedio === null ? "—" : `${horasPromedio.toFixed(1)} h`,
    },
  ];
}

export default function SupervisorPage() {
  const [permisos, setPermisos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listarPendientes()
      .then(setPermisos)
      .catch((err) => setError(getApiErrorMessage(err)));
  }, []);

  const metricas = useMemo(() => (permisos ? calcularMetricas(permisos) : null), [permisos]);

  return (
    <div>
      <h1>Reportería</h1>
      <p className="page-subtitle">
        Vista de solo lectura — métricas calculadas sobre <code>GET /api/permisos</code> de tu comuna.
      </p>

      {error && (
        <p className="pending-banner error-banner">
          No se pudo conectar al Backend ({error}). No hay un rol Supervisor real todavía en el
          sistema — esta vista usa los mismos datos que ve un Operador de su comuna.
        </p>
      )}

      {!metricas && !error && <p className="page-subtitle">Cargando métricas…</p>}

      {metricas && (
        <div className="metrics-grid">
          {metricas.map((m) => (
            <div className="metric-card" key={m.label}>
              <span className="metric-value">{m.value}</span>
              <span className="metric-label">{m.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}