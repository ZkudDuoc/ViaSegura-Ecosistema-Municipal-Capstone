import MapView from "../components/MapView";
import "./OperadorPage.css";

const SOLICITUDES_MOCK = [
  { id: "SOL-1042", empresa: "Transportes Andina Ltda.", riesgo: "Medio", estado: "En evaluación" },
  { id: "SOL-1041", empresa: "Log-Sur SpA", riesgo: "Bajo", estado: "Aprobada" },
  { id: "SOL-1039", empresa: "Carga Express", riesgo: "Alto", estado: "Pendiente" },
];

const RIESGO_CLASS = { Bajo: "riesgo-bajo", Medio: "riesgo-medio", Alto: "riesgo-alto" };

export default function OperadorPage() {
  return (
    <div>
      <h1>Bandeja de decisiones</h1>
      <p className="page-subtitle">
        Mockup — Semana 2 conecta este panel al ciclo de vida real del permiso.
      </p>

      <MapView height={360} />

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
          {SOLICITUDES_MOCK.map((s) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.empresa}</td>
              <td>
                <span className={`riesgo-pill ${RIESGO_CLASS[s.riesgo]}`}>{s.riesgo}</span>
              </td>
              <td>{s.estado}</td>
              <td>
                <button className="btn-secondary">Revisar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
