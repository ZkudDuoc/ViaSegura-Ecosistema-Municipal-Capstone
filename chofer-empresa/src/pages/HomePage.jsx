import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listarPermisos } from "../services/permisoService";
import { getApiErrorMessage } from "../services/api";
import { ESTADO_LABEL, ESTADO_CLASE, formatearFecha } from "../utils/formato";
import QrPermisoModal from "../components/QrPermisoModal";
import "./paginas.css";

// Estados en que el supervisor puede fiscalizar el permiso en terreno.
const ESTADOS_CON_QR = ["APROBADO", "ACTIVO", "ACTIVO_PENDIENTE_EVIDENCIA"];

export default function HomePage() {
  const [permisos, setPermisos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [qrPermiso, setQrPermiso] = useState(null);

  const cargar = () => {
    setError(null);
    return listarPermisos()
      .then(setPermisos)
      .catch((err) => setError(getApiErrorMessage(err)));
  };

  useEffect(() => {
    cargar().finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="encabezado-fila">
        <h1>Mis solicitudes</h1>
        <button type="button" className="btn-link" onClick={cargar}>
          Actualizar
        </button>
      </div>
      <p className="subtitulo">Estado de tus permisos de circulación.</p>

      {loading && <p className="subtitulo">Cargando…</p>}
      {error && <p className="texto-error">{error}</p>}

      {!loading && !error && permisos.length === 0 && (
        <div className="card vacio">
          Todavía no tienes solicitudes.{" "}
          <Link to="/solicitud" className="enlace">
            Crear la primera
          </Link>
        </div>
      )}

      <ul className="lista-permisos">
        {permisos.map((p) => (
          <li key={p.id} className="card">
            <div className="permiso-cabecera">
              <span className="permiso-tipo">
                {p.tipo_actividad === "EMERGENCIA" ? "Emergencia" : "Programada"}
              </span>
              <span className={`badge ${ESTADO_CLASE[p.estado] ?? ""}`}>
                {ESTADO_LABEL[p.estado] ?? p.estado}
              </span>
            </div>
            <div className="permiso-detalle">
              {formatearFecha(p.ventana_inicio)} → {formatearFecha(p.ventana_fin)}
            </div>
            <div className="permiso-detalle">Riesgo: {p.riesgo ?? "sin evaluar"}</div>

            {p.estado === "APROBADO" && (
              <Link to={`/solicitudes/${p.id}/llegada`} className="btn-primary btn-accion">
                Iniciar trabajo
              </Link>
            )}
            {ESTADOS_CON_QR.includes(p.estado) && (
              <button type="button" className="btn-secondary btn-accion" onClick={() => setQrPermiso(p)}>
                Mostrar QR
              </button>
            )}
          </li>
        ))}
      </ul>

      {qrPermiso && <QrPermisoModal permiso={qrPermiso} onCerrar={() => setQrPermiso(null)} />}
    </div>
  );
}