import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listarInfracciones, esEndpointNoDisponible } from "../services/infraccionService";
import { getApiErrorMessage } from "../services/api";
import { formatearFecha } from "../utils/formato";
import "./paginas.css";
import "./supervisor.css";

export default function MultasPage() {
  const [multas, setMultas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [noDisponible, setNoDisponible] = useState(false);

  const cargar = () => {
    setError(null);
    return listarInfracciones()
      .then(setMultas)
      .catch((err) => {
        if (esEndpointNoDisponible(err)) setNoDisponible(true);
        else setError(getApiErrorMessage(err));
      });
  };

  useEffect(() => {
    cargar().finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="encabezado-fila">
        <h1>Multas</h1>
        <button type="button" className="btn-link" onClick={cargar}>
          Actualizar
        </button>
      </div>
      <p className="subtitulo">Infracciones registradas en tu comuna.</p>

      <Link to="/multas/nueva" className="btn-primary btn-accion multas-nueva">
        Nueva multa sin permiso
      </Link>

      {loading && <p className="subtitulo">Cargando…</p>}
      {error && <p className="texto-error">{error}</p>}
      {noDisponible && (
        <div className="card vacio">El registro de multas todavía no está disponible en el servidor.</div>
      )}

      {!loading && !error && !noDisponible && multas.length === 0 && (
        <div className="card vacio">Todavía no hay multas registradas.</div>
      )}

      <ul className="lista-permisos">
        {multas.map((m) => (
          <li key={m.id} className="card multa-item">
            <div className="multa-info">
              <div className="permiso-tipo">{m.descripcion}</div>
              <div className="permiso-detalle">RUT {m.rut_infractor}</div>
              <div className="permiso-detalle">
                {formatearFecha(m.fecha)}
                {m.permiso_id ? ` · Permiso ${m.permiso_id.slice(0, 8).toUpperCase()}` : " · Sin permiso"}
                {m.patente ? ` · ${m.patente}` : ""}
              </div>
            </div>
            {m.evidencia_url && <img src={m.evidencia_url} alt="Evidencia" className="multa-foto" />}
          </li>
        ))}
      </ul>
    </div>
  );
}