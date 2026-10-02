import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listarPermisos } from "../services/permisoService";
import { getApiErrorMessage } from "../services/api";
import { ESTADO_LABEL, ESTADO_CLASE, formatearFecha } from "../utils/formato";
import "./paginas.css";

export default function HomePage() {
  const [permisos, setPermisos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
                {p.tipo_actividad === "EMERGENCIA" ? "Emergencia" : "Programada"} · {p.id.slice(0, 8).toUpperCase()}
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
              <p className="permiso-aviso-chofer">
                Aprobada. Para iniciar el trabajo, genera el código del chofer en "Ver detalle".
              </p>
            )}

            <Link to={`/solicitudes/${p.id}`} className="btn-secondary btn-accion">
              Ver detalle
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}