import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { calcularAreaTrabajo } from "../utils/geo";
import { buscarDirecciones, direccionDePunto, acortarDireccion } from "../services/geocodingService";
import "./UbicacionPicker.css";

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const SANTIAGO_CENTER = [-70.6483, -33.4569];
// A zoom de ciudad un rectángulo de ~18 m no se ve: al elegir un punto se acerca el mapa.
const ZOOM_DETALLE = 18;
const VACIO = { type: "FeatureCollection", features: [] };
// Espera tras la última tecla antes de buscar (Nominatim permite 1 request/s).
const ESPERA_BUSQUEDA_MS = 600;
const MIN_CARACTERES = 4;

// Ubicación del camión para una solicitud: la empresa escribe la dirección
// (con autocompletado) y puede corregir arrastrando el pin o tocando el mapa.
// El área se calcula sola con las medidas del camión + conos.
// `onChange` debe ser estable (ej. el setState del padre).
export default function UbicacionPicker({ vehiculo, onChange }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [mapaListo, setMapaListo] = useState(false);
  const [punto, setPunto] = useState(null);
  const [rumbo, setRumbo] = useState(0);

  const [consulta, setConsulta] = useState("");
  const [buscarActivo, setBuscarActivo] = useState(false);
  const [sugerencias, setSugerencias] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(null);

  // Mueve el camión a un punto del mapa y rellena el campo con su dirección.
  const moverDesdeMapa = async ({ lat, lng }) => {
    setPunto({ lat, lng });
    setBuscarActivo(false);
    setSugerencias([]);
    const direccion = await direccionDePunto({ lat, lng }).catch(() => null);
    if (direccion) setConsulta(acortarDireccion(direccion));
  };

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: SANTIAGO_CENTER,
      zoom: 12,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("area-trabajo", { type: "geojson", data: VACIO });
      map.addLayer({
        id: "area-trabajo-relleno",
        type: "fill",
        source: "area-trabajo",
        paint: { "fill-color": "#0b5fff", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "area-trabajo-borde",
        type: "line",
        source: "area-trabajo",
        paint: { "line-color": "#0842b0", "line-width": 2 },
      });
      setMapaListo(true);
    });

    map.on("click", (e) => {
      moverDesdeMapa({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      if (map.getZoom() < 16) map.easeTo({ center: e.lngLat, zoom: ZOOM_DETALLE });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Autocompletado: busca cuando la persona deja de escribir.
  useEffect(() => {
    const texto = consulta.trim();
    if (!buscarActivo || texto.length < MIN_CARACTERES) {
      setSugerencias([]);
      return undefined;
    }

    const controlador = new AbortController();
    const espera = setTimeout(async () => {
      setBuscando(true);
      setError(null);
      try {
        const resultados = await buscarDirecciones(texto, { signal: controlador.signal });
        setSugerencias(resultados);
        if (resultados.length === 0) setError("No encontramos esa dirección. Prueba agregando la comuna.");
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        setBuscando(false);
      }
    }, ESPERA_BUSQUEDA_MS);

    return () => {
      clearTimeout(espera);
      controlador.abort();
    };
  }, [consulta, buscarActivo]);

  // Recalcula y dibuja el área cada vez que cambia el punto o la orientación.
  useEffect(() => {
    if (!punto) return;
    const resultado = calcularAreaTrabajo({ ...punto, rumbo }, vehiculo);
    onChange({ posicion: punto, direccion: consulta, ...resultado });

    const map = mapRef.current;
    if (!map || !mapaListo) return;

    map.getSource("area-trabajo").setData({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[...resultado.area, resultado.area[0]]] },
      properties: {},
    });

    if (!markerRef.current) {
      // Pin arrastrable para corregir la ubicación exacta del camión.
      markerRef.current = new maplibregl.Marker({ color: "#0b5fff", draggable: true });
      markerRef.current.on("dragend", () => {
        const { lat, lng } = markerRef.current.getLngLat();
        moverDesdeMapa({ lat, lng });
      });
    }
    markerRef.current.setLngLat([punto.lng, punto.lat]).addTo(map);
    // `consulta` se omite a propósito: escribir en el campo no debe redibujar el área.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punto, rumbo, vehiculo, mapaListo, onChange]);

  const elegirSugerencia = (sugerencia) => {
    setConsulta(acortarDireccion(sugerencia.etiqueta));
    setBuscarActivo(false);
    setSugerencias([]);
    setError(null);
    setPunto({ lat: sugerencia.lat, lng: sugerencia.lng });
    mapRef.current?.flyTo({ center: [sugerencia.lng, sugerencia.lat], zoom: ZOOM_DETALLE });
  };

  const handleTeclado = (e) => {
    // Enter no debe enviar el formulario de la solicitud: elige la primera sugerencia.
    if (e.key === "Enter") {
      e.preventDefault();
      if (sugerencias[0]) elegirSugerencia(sugerencias[0]);
    }
    if (e.key === "Escape") setSugerencias([]);
  };

  return (
    <div className="ubicacion-picker">
      <div className="ubicacion-buscador">
        <input
          type="text"
          value={consulta}
          onChange={(e) => {
            setConsulta(e.target.value);
            setBuscarActivo(true);
          }}
          onKeyDown={handleTeclado}
          placeholder="Escribe la dirección, ej: Av. Providencia 1234, Providencia"
          aria-label="Dirección del trabajo"
          autoComplete="off"
        />
        {buscando && <span className="ubicacion-buscando">Buscando…</span>}

        {sugerencias.length > 0 && (
          <ul className="ubicacion-sugerencias" role="listbox">
            {sugerencias.map((s) => (
              <li key={s.id} role="option" aria-selected="false">
                <button type="button" onClick={() => elegirSugerencia(s)}>
                  {acortarDireccion(s.etiqueta)}
                  <span className="ubicacion-sugerencia-detalle">{s.etiqueta}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div ref={containerRef} className="ubicacion-mapa" />

      <p className="permiso-detalle">
        {punto
          ? "Si el pin no quedó exacto, arrástralo o toca el punto correcto en el mapa."
          : "Escribe la dirección y elige una sugerencia, o toca en el mapa dónde estará el camión."}
      </p>

      {punto && (
        <div className="ubicacion-giro">
          <label htmlFor="giro">Orientación del camión: {rumbo}°</label>
          <input
            id="giro"
            type="range"
            min="0"
            max="179"
            value={rumbo}
            onChange={(e) => setRumbo(Number(e.target.value))}
          />
        </div>
      )}

      {error && <p className="texto-error">{error}</p>}

      <p className="ubicacion-atribucion">Búsqueda de direcciones: © OpenStreetMap</p>
    </div>
  );
}