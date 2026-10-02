import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { obtenerCallesRiesgo } from "../services/riesgoService";
import { useAuth } from "../context/AuthContext";

// El dataset de calles pesa ~3 MB: solo se pide la primera vez que se activa la capa.
function useCallesRiesgo(activa) {
  const [estado, setEstado] = useState({ calles: [], fuente: null, cargando: false, error: null, cargadas: false });

  useEffect(() => {
    if (!activa || estado.cargadas || estado.cargando) return;
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    obtenerCallesRiesgo()
      .then((r) => setEstado({ calles: r.calles, fuente: r.fuente_datos, cargando: false, error: null, cargadas: true }))
      .catch((err) =>
        setEstado((e) => ({
          ...e,
          cargando: false,
          error: err?.response
            ? "El servicio de riesgo respondió con un error."
            : "No se pudo conectar con el servicio de riesgo (¿está corriendo en el puerto 8000?).",
        }))
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activa]);

  return estado;
}

// Nombre de la comuna del operador, para filtrar sus calles por defecto.
function useNombreComunaOperador() {
  const { usuario } = useAuth();
  const [nombre, setNombre] = useState(null);

  useEffect(() => {
    if (!usuario?.comuna_id) return;
    api
      .get("/comunas")
      .then((res) => setNombre(res.data.find((c) => c.id === usuario.comuna_id)?.nombre ?? null))
      .catch(() => {});
  }, [usuario?.comuna_id]);

  return nombre;
}

function aFeatures(calles, comuna) {
  return {
    type: "FeatureCollection",
    features: calles
      .filter((c) => comuna === "TODAS" || c.comuna === comuna)
      .map((c) => ({
        type: "Feature",
        geometry: c.geometry_geojson,
        properties: {
          nombre: c.nombre,
          comuna: c.comuna ?? "",
          riesgo: c.risk_score,
          congestion: c.congestion_score,
          flujo: c.flujo_vehicular_hora,
          incidentes: c.n_incidentes,
        },
      })),
  };
}

// Estado de la capa de calles: el control (casilla, filtros) y lo que se pinta en el mapa.
export function useCapaCalles() {
  const [activa, setActiva] = useState(false);
  const [colorPor, setColorPor] = useState("riesgo");
  const [comunaElegida, setComunaElegida] = useState(null);
  const datos = useCallesRiesgo(activa);
  const comunaOperador = useNombreComunaOperador();

  const comunas = useMemo(
    () => [...new Set(datos.calles.map((c) => c.comuna).filter(Boolean))].sort(),
    [datos.calles]
  );

  // Por defecto, la comuna del operador si existe en los datos; si no, todas.
  const comuna =
    comunaElegida ?? comunas.find((c) => c.toUpperCase() === comunaOperador?.toUpperCase()) ?? "TODAS";

  const features = useMemo(
    () => (activa && datos.cargadas ? aFeatures(datos.calles, comuna) : null),
    [activa, datos.cargadas, datos.calles, comuna]
  );

  return {
    control: {
      activa,
      setActiva,
      colorPor,
      setColorPor,
      comuna,
      setComuna: setComunaElegida,
      comunas,
      cargando: datos.cargando,
      error: datos.error,
      fuente: datos.fuente,
      total: features?.features.length ?? 0,
    },
    features,
    colorPor,
  };
}

export default function CallesRiesgoControl({
  activa,
  setActiva,
  colorPor,
  setColorPor,
  comuna,
  setComuna,
  comunas,
  cargando,
  error,
  fuente,
  total,
}) {
  return (
    <div className="calles-control">
      <div className="calles-control-fila">
        <label className="calles-toggle">
          <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          Mostrar calles por riesgo
        </label>

        {activa && (
          <>
            <select value={colorPor} onChange={(e) => setColorPor(e.target.value)} aria-label="Colorear calles por">
              <option value="riesgo">Colorear por riesgo</option>
              <option value="congestion">Colorear por congestión</option>
            </select>
            <select
              value={comuna}
              onChange={(e) => setComuna(e.target.value)}
              aria-label="Comuna de las calles"
              disabled={comunas.length === 0}
            >
              <option value="TODAS">Todas las comunas</option>
              {comunas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className={error ? "calles-estado texto-error-chico" : "calles-estado"}>
              {cargando ? "Cargando calles…" : error ?? `${total} tramos de calle`}
            </span>
          </>
        )}
      </div>

      {activa && !cargando && !error && (
        <div className="calles-leyenda">
          <span className="leyenda-gradiente" />
          <span>{colorPor === "riesgo" ? "Riesgo bajo → alto" : "Congestión baja → alta"}</span>
        </div>
      )}
      {activa && fuente && <p className="calles-fuente">{fuente}</p>}
    </div>
  );
}