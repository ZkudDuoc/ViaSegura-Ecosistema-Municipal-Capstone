import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { obtenerHistorico } from "../services/reporteriaService";
import { getApiErrorMessage } from "../services/api";
import { ESTADO_LABEL, ESTADO_CLASS, codigoCorto, formatearFecha } from "../utils/permisos";

const ESTADOS_APROBADAS = ["APROBADO", "ACTIVO", "ACTIVO_PENDIENTE_EVIDENCIA", "FINALIZADO", "EXPIRADO", "SUSPENDIDO"];
const DESDE_SIEMPRE = "2020-01-01T00:00:00.000Z";

function normalizarRut(rut) {
  return String(rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
}

// Todo el historial de una empresa o persona (identificada por su RUT):
// solicitudes de todos los períodos y multas cursadas.
export default function FichaRut({ rut, nombre, multas, onCerrar }) {
  const [solicitudes, setSolicitudes] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    obtenerHistorico({ desde: DESDE_SIEMPRE, hasta: new Date().toISOString() })
      .then((filas) => setSolicitudes(filas.filter((f) => normalizarRut(f.rut_ejecutor) === normalizarRut(rut))))
      .catch((err) => setError(getApiErrorMessage(err)));
  }, [rut]);

  useEffect(() => {
    const alPresionar = (e) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [onCerrar]);

  const multasDelRut = useMemo(
    () => multas.filter((m) => normalizarRut(m.rut_infractor) === normalizarRut(rut)),
    [multas, rut]
  );

  const cuenta = (estados) => (solicitudes ?? []).filter((s) => estados.includes(s.estado)).length;

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal-ficha" role="dialog" aria-modal="true" aria-labelledby="ficha-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="modal-encabezado">
          <div>
            <h2 id="ficha-titulo">{nombre ?? "Persona natural"}</h2>
            <span className="ficha-rut">RUT {rut}</span>
          </div>
          <button type="button" className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>

        {error && <p className="pending-banner error-banner">{error}</p>}
        {!solicitudes && !error && <p className="reporte-texto">Cargando historial…</p>}

        {solicitudes && (
          <>
            <div className="ficha-cifras">
              <div>
                <strong>{solicitudes.length}</strong>
                <span>Solicitudes</span>
              </div>
              <div>
                <strong>{cuenta(ESTADOS_APROBADAS)}</strong>
                <span>Aprobadas</span>
              </div>
              <div>
                <strong>{cuenta(["RECHAZADO"])}</strong>
                <span>Rechazadas</span>
              </div>
              <div>
                <strong>{cuenta(["REVOCADO"])}</strong>
                <span>Revocadas</span>
              </div>
              <div>
                <strong>{multasDelRut.length}</strong>
                <span>Multas</span>
              </div>
            </div>

            <h3 className="ficha-subtitulo">Solicitudes</h3>
            {solicitudes.length === 0 ? (
              <p className="reporte-texto">Sin solicitudes registradas.</p>
            ) : (
              <ul className="ficha-lista">
                {solicitudes.map((s) => (
                  <li key={s.id}>
                    <Link to={`/solicitudes/${s.id}`} className="link-detalle" onClick={onCerrar}>
                      {codigoCorto(s.id)}
                    </Link>
                    <span>{formatearFecha(s.created_at)}</span>
                    <span className={`estado-pill ${ESTADO_CLASS[s.estado] ?? ""}`}>{ESTADO_LABEL[s.estado] ?? s.estado}</span>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="ficha-subtitulo">Multas</h3>
            {multasDelRut.length === 0 ? (
              <p className="reporte-texto">Sin multas registradas.</p>
            ) : (
              <ul className="ficha-lista">
                {multasDelRut.map((m) => (
                  <li key={m.id}>
                    <span>{formatearFecha(m.fecha)}</span>
                    <span>{m.descripcion.split(" — ")[0]}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}