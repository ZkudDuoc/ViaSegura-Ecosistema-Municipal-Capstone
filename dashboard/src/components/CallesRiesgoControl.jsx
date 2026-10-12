import { useEffect, useRef, useState } from "react";
import { obtenerCallesRiesgo } from "../services/riesgoService";
import { getApiErrorMessage } from "../services/api";
import "./CallesRiesgoControl.css";

// Comuna principal del sistema: las calles vienen de SECTRA para Santiago Centro.
const COMUNA = "SANTIAGO";

const METRICAS = [
  { valor: "riesgo", label: "Riesgo" },
  { valor: "congestion", label: "Congestión" },
];

const NIVEL_TEXTO = { bajo: "Bajo", medio: "Medio", alto: "Alto" };

const horaTexto = (h) => `${String(h).padStart(2, "0")}:00 a ${String(h).padStart(2, "0")}:59`;

// Estado de la capa de calles: qué se muestra y el GeoJSON que se pinta en el
// mapa. Cada combinación métrica + hora se guarda al llegar, así cambiar de
// una a otra y volver no vuelve a pedir ~1 MB al servidor.
export function useCapaCalles() {
  const [activa, setActiva] = useState(false);
  const [metrica, setMetrica] = useState("riesgo");
  // Por defecto la hora actual: el operador ve cómo están las calles ahora.
  const [hora, setHora] = useState(() => String(new Date().getHours()));
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const guardadas = useRef(new Map());

  useEffect(() => {
    if (!activa) return;
    const clave = `${metrica}|${hora}`;
    if (guardadas.current.has(clave)) {
      setDatos(guardadas.current.get(clave));
      setError(null);
      return;
    }

    let vigente = true;
    setCargando(true);
    setError(null);
    obtenerCallesRiesgo({ comuna: COMUNA, metrica, hora: hora === "" ? undefined : hora, formato: "geojson" })
      .then((res) => {
        guardadas.current.set(clave, res);
        if (vigente) setDatos(res);
      })
      .catch((err) => {
        if (!vigente) return;
        setError(
          err?.response
            ? getApiErrorMessage(err)
            : "No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo."
        );
      })
      .finally(() => vigente && setCargando(false));

    return () => {
      vigente = false;
    };
  }, [activa, metrica, hora]);

  return {
    control: { activa, setActiva, metrica, setMetrica, hora, setHora, cargando, error, metadata: datos?.metadata ?? null },
    // Mientras llega la combinación nueva se sigue viendo la anterior.
    features: activa && datos ? datos : null,
  };
}

export default function CallesRiesgoControl({ activa, setActiva, metrica, setMetrica, hora, setHora, cargando, error, metadata }) {
  return (
    <section className="capa-calles" aria-label="Calles de Santiago Centro">
      <div className="capa-calles-barra">
        <label className="capa-calles-toggle">
          <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          Pintar calles de Santiago Centro
        </label>

        {activa && (
          <>
            <div className="capa-calles-grupo" role="group" aria-label="Pintar según">
              {METRICAS.map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  className={"capa-calles-opcion" + (metrica === m.valor ? " activa" : "")}
                  aria-pressed={metrica === m.valor}
                  onClick={() => setMetrica(m.valor)}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <label className="capa-calles-hora">
              Hora
              <select value={hora} onChange={(e) => setHora(e.target.value)}>
                <option value="">Promedio del día</option>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={String(h)}>
                    {horaTexto(h)}
                  </option>
                ))}
              </select>
            </label>

            <span className={"capa-calles-estado" + (error ? " error" : "")} role="status">
              {cargando ? "Cargando calles…" : error ?? (metadata ? `${metadata.total} tramos de calle` : "")}
            </span>
          </>
        )}
      </div>

      {activa && metadata?.leyenda && (
        <div className="capa-calles-leyenda">
          <span className="capa-calles-leyenda-titulo">
            {metrica === "riesgo" ? "Riesgo de delitos por calle" : "Congestión vehicular por calle"}
          </span>
          <ul>
            {metadata.leyenda.map((l) => (
              <li key={l.nivel}>
                <span className="capa-calles-color" style={{ background: l.color }} />
                <strong>{NIVEL_TEXTO[l.nivel] ?? l.nivel}</strong>
                <span className="capa-calles-rango">{l.rango}</span>
              </li>
            ))}
          </ul>
          <p className="capa-calles-nota">
            {metrica === "riesgo"
              ? "Los niveles comparan cada calle con el resto de Santiago Centro. Toca una calle para ver su detalle."
              : hora === ""
                ? "Flujo promedio medido por SECTRA. Elige una hora para ver la estimación de ese momento."
                : "Estimación para la hora elegida a partir del flujo medido por SECTRA. Toca una calle para ver su detalle."}
          </p>
          {metadata.fuente_datos && <p className="capa-calles-fuente">Fuente: {metadata.fuente_datos}</p>}
        </div>
      )}
    </section>
  );
}