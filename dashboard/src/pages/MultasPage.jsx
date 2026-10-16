import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PuntoMapa from "../components/PuntoMapa";
import Icono from "../components/Icono";
import { ListaCargando, ListaVacia } from "../components/EstadoLista";
import { listarInfracciones } from "../services/infraccionService";
import { getApiErrorMessage } from "../services/api";
import { formatearFecha, codigoCorto } from "../utils/permisos";
import "./OperadorPage.css";
import "./SolicitudDetallePage.css";
import "./MultasPage.css";

const PERIODOS = [
  { value: "HOY", label: "Hoy", dias: 0 },
  { value: "7D", label: "Últimos 7 días", dias: 7 },
  { value: "30D", label: "Últimos 30 días", dias: 30 },
  { value: "TODAS", label: "Todas", dias: null },
];

// La app Supervisor guarda "Tipo de infracción — observación" en `descripcion`.
function separarDescripcion(descripcion = "") {
  const [tipo, ...resto] = descripcion.split(" — ");
  return { tipo, observacion: resto.join(" — ") || null };
}

function puntoDe(multa) {
  const [lng, lat] = multa.ubicacion?.coordinates ?? [];
  return lat != null ? { lat, lng } : null;
}

function dentroDelPeriodo(fecha, periodo) {
  const { dias } = PERIODOS.find((p) => p.value === periodo);
  if (dias === null) return true;
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  desde.setDate(desde.getDate() - dias);
  return new Date(fecha) >= desde;
}

function normalizar(texto) {
  return String(texto ?? "").toLowerCase().replace(/[\s.-]/g, "");
}

function MultaDetalle({ multa, onCerrar }) {
  const { tipo, observacion } = separarDescripcion(multa.descripcion);
  const punto = puntoDe(multa);

  useEffect(() => {
    const alPresionar = (e) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [onCerrar]);

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div
        className="modal-multa"
        role="dialog"
        aria-modal="true"
        aria-labelledby="multa-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-encabezado">
          <h2 id="multa-titulo">{tipo}</h2>
          <button type="button" className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>

        <dl className="detalle-datos">
          <div>
            <dt>RUT infractor</dt>
            <dd>{multa.rut_infractor}</dd>
          </div>
          <div>
            <dt>Fecha</dt>
            <dd>{formatearFecha(multa.fecha)}</dd>
          </div>
          <div>
            <dt>Cursada por</dt>
            <dd>Supervisor municipal</dd>
          </div>
          <div>
            <dt>Solicitud</dt>
            <dd>
              {multa.permiso_id ? (
                <Link to={`/solicitudes/${multa.permiso_id}`} className="link-detalle">
                  {codigoCorto(multa.permiso_id)}
                </Link>
              ) : (
                "Sin permiso (fiscalización a camión sin permiso)"
              )}
            </dd>
          </div>
        </dl>

        {observacion && (
          <>
            <h3 className="detalle-subtitulo">Observación del supervisor</h3>
            <p className="multa-observacion">{observacion}</p>
          </>
        )}

        <div className="detalle-grid multa-grid">
          <section>
            <h3 className="detalle-subtitulo">Foto de evidencia</h3>
            {multa.evidencia_url ? (
              <img src={multa.evidencia_url} alt="Evidencia de la infracción" className="detalle-foto" />
            ) : (
              <p className="detalle-vacio">El supervisor no adjuntó foto.</p>
            )}
          </section>
          <section>
            <h3 className="detalle-subtitulo">Lugar</h3>
            <PuntoMapa punto={punto} />
            {punto && (
              <a
                href={`https://www.google.com/maps?q=${punto.lat},${punto.lng}`}
                target="_blank"
                rel="noreferrer"
                className="multa-mapa-link"
              >
                Abrir en Google Maps
              </a>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default function MultasPage() {
  const [multas, setMultas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [periodo, setPeriodo] = useState("30D");
  const [busqueda, setBusqueda] = useState("");
  const [seleccionada, setSeleccionada] = useState(null);

  useEffect(() => {
    listarInfracciones()
      .then(setMultas)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setCargando(false));
  }, []);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda);
    return multas
      .filter((m) => dentroDelPeriodo(m.fecha, periodo))
      .filter(
        (m) =>
          !q ||
          [m.rut_infractor, m.descripcion, m.permiso_id && codigoCorto(m.permiso_id)].some((campo) =>
            normalizar(campo).includes(q)
          )
      );
  }, [multas, periodo, busqueda]);

  const conPermiso = visibles.filter((m) => m.permiso_id).length;

  return (
    <div>
      <h1>Multas</h1>
      <p className="page-subtitle">Infracciones cursadas por los supervisores en terreno.</p>

      <div className="multas-resumen">
        <div className="multas-cifra cifra-amarilla">
          <span className="multas-cifra-cabecera">
            <span className="multas-cifra-label">Multas en el período</span>
            <span className="multas-cifra-icono">
              <Icono nombre="multa" tamano={18} />
            </span>
          </span>
          <span className="multas-cifra-valor">{cargando ? "—" : visibles.length}</span>
        </div>
        <div className="multas-cifra cifra-azul">
          <span className="multas-cifra-cabecera">
            <span className="multas-cifra-label">Con permiso</span>
            <span className="multas-cifra-icono">
              <Icono nombre="check" tamano={18} />
            </span>
          </span>
          <span className="multas-cifra-valor">{cargando ? "—" : conPermiso}</span>
        </div>
        <div className="multas-cifra cifra-roja">
          <span className="multas-cifra-cabecera">
            <span className="multas-cifra-label">Sin permiso</span>
            <span className="multas-cifra-icono">
              <Icono nombre="alerta" tamano={18} />
            </span>
          </span>
          <span className="multas-cifra-valor">{cargando ? "—" : visibles.length - conPermiso}</span>
        </div>
      </div>

      <div className="bandeja-filtros">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por RUT, tipo de infracción o código de solicitud"
          aria-label="Buscar multas"
        />
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Período">
          {PERIODOS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {cargando && (
        <div className="multas-lista">
          <ListaCargando tipo="tabla" filas={5} etiqueta="Cargando multas" />
        </div>
      )}
      {error && <p className="pending-banner error-banner">{error}</p>}

      {!cargando && !error && visibles.length === 0 && (
        <div className="multas-lista">
          <ListaVacia
            icono="multa"
            titulo={multas.length === 0 ? "Todavía no hay multas registradas" : "Ninguna multa coincide"}
          >
            {multas.length === 0
              ? "Cuando un supervisor curse una infracción en terreno, aparecerá aquí."
              : "Prueba con otro período o revisa lo que escribiste en la búsqueda."}
          </ListaVacia>
        </div>
      )}

      {!cargando && !error && visibles.length > 0 && (
        <div className="tabla-contenedor multas-lista">
          <table className="solicitudes-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Infracción</th>
                <th>RUT</th>
                <th>Solicitud</th>
                <th>Foto</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((m) => {
                const { tipo } = separarDescripcion(m.descripcion);
                return (
                  <tr key={m.id} className="fila-clicable" onClick={() => setSeleccionada(m)}>
                    <td className="celda-sub">{formatearFecha(m.fecha)}</td>
                    <td>
                      <button type="button" className="multa-link" onClick={() => setSeleccionada(m)}>
                        {tipo}
                      </button>
                    </td>
                    <td>{m.rut_infractor}</td>
                    <td>
                      {m.permiso_id ? (
                        <span className="link-detalle">{codigoCorto(m.permiso_id)}</span>
                      ) : (
                        <span className="badge-emergencia">Sin permiso</span>
                      )}
                    </td>
                    <td>{m.evidencia_url ? <img src={m.evidencia_url} alt="" className="detalle-multa-foto" /> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {seleccionada && <MultaDetalle multa={seleccionada} onCerrar={() => setSeleccionada(null)} />}
    </div>
  );
}