import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { calcularAreaTrabajo, puntoEnLimite, areaEnLimite, cajaDeLimite } from "../utils/geo";
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
const MENSAJE_FUERA = "Ese punto está fuera de la comuna seleccionada.";
// Margen para mover el mapa un poco más allá del borde de la comuna.
const MARGEN_MAPA_GRADOS = 0.02;

function vistaInicial(limite) {
  if (!limite) return { center: SANTIAGO_CENTER, zoom: 12 };
  const caja = cajaDeLimite(limite);
  const [[oeste, sur], [este, norte]] = caja;
  return {
    bounds: caja,
    fitBoundsOptions: { padding: 24 },
    maxBounds: [
      [oeste - MARGEN_MAPA_GRADOS, sur - MARGEN_MAPA_GRADOS],
      [este + MARGEN_MAPA_GRADOS, norte + MARGEN_MAPA_GRADOS],
    ],
  };
}

// Ubicación del camión para una solicitud: la empresa escribe la dirección
// (con autocompletado) y puede corregir arrastrando el pin o tocando el mapa.
// El área se calcula sola con las medidas del camión + conos.
// `onChange` debe ser estable (ej. el setState del padre).
export default function UbicacionPicker({ vehiculo, limite = null, onChange }) {
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
  const [areaFuera, setAreaFuera] = useState(false);
  const puntoRef = useRef(null);

  // Rechaza puntos fuera de la comuna; el pin vuelve a su última posición válida.
  const aceptarPunto = (posicion) => {
    if (puntoEnLimite(posicion, limite)) {
      setError(null);
      return true;
    }
    setError(MENSAJE_FUERA);
    if (puntoRef.current) markerRef.current?.setLngLat([puntoRef.current.lng, puntoRef.current.lat]);
    return false;
  };

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
      ...vistaInicial(limite),
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
      if (limite) {
        map.addSource("limite-comuna", { type: "geojson", data: { type: "Feature", geometry: limite, properties: {} } });
        map.addLayer({
          id: "limite-comuna-borde",
          type: "line",
          source: "limite-comuna",
          paint: { "line-color": "#0b2a5b", "line-width": 2, "line-dasharray": [2, 2] },
        });
      }
      setMapaListo(true);
    });

    map.on("click", (e) => {
      const posicion = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      if (!aceptarPunto(posicion)) return;
      moverDesdeMapa(posicion);
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
        const dentro = resultados.filter((r) => puntoEnLimite(r, limite));
        setSugerencias(dentro);
        if (resultados.length === 0) setError("No encontramos esa dirección. Prueba agregando la comuna.");
        else if (dentro.length === 0) setError(MENSAJE_FUERA);
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
    puntoRef.current = punto;
    const dentro = areaEnLimite(resultado.area, limite);
    setAreaFuera(!dentro);
    onChange(dentro ? { posicion: punto, direccion: consulta, ...resultado } : null);

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
        if (!aceptarPunto({ lat, lng })) return;
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
          placeholder="Escribe la dirección, ej: Agustinas 1234, Santiago"
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

      {areaFuera && (
        <p className="texto-error">El área del camión se sale de la comuna. Acerca el pin al interior o cambia la orientación.</p>
      )}
      {error && <p className="texto-error">{error}</p>}

      <p className="ubicacion-atribucion">Búsqueda de direcciones: © OpenStreetMap</p>
    </div>
  );
}