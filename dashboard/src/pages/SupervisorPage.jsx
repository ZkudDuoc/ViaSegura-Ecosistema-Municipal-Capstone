import "./SupervisorPage.css";

const METRICAS_MOCK = [
  { label: "Solicitudes este mes", value: "128" },
  { label: "Aprobadas", value: "97" },
  { label: "Rechazadas / Riesgo alto", value: "12" },
  { label: "Tiempo promedio de evaluación", value: "4.2 h" },
];

export default function SupervisorPage() {
  return (
    <div>
      <h1>Reportería</h1>
      <p className="page-subtitle">
        Vista de solo lectura — mockup. Semana 3 conecta métricas reales del Backend.
      </p>

      <div className="metrics-grid">
        {METRICAS_MOCK.map((m) => (
          <div className="metric-card" key={m.label}>
            <span className="metric-value">{m.value}</span>
            <span className="metric-label">{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
