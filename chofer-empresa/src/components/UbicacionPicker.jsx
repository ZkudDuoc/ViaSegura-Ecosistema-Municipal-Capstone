import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { obtenerPosicion, calcularAreaTrabajo } from "../utils/geo";
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

// Ubicación del camión para una solicitud: tocando el mapa (solicitudes con
// anticipación) o con el GPS (ya en el lugar). El área se calcula sola con
// las medidas del camión + conos; el chofer solo elige el punto y la orientación.
// `onChange` debe ser estable (ej. el setState del padre).
export default function UbicacionPicker({ vehiculo, onChange }) {  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [mapaListo, setMapaListo] = useState(false);
  const [punto, setPunto] = useState(null);
  const [rumbo, setRumbo] = useState(0);
  const [ubicando, setUbicando] = useState(false);
  const [error, setError] = useState(null);

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
      setPunto({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      if (map.getZoom() < 16) map.easeTo({ center: e.lngLat, zoom: ZOOM_DETALLE });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Recalcula y dibuja el área cada vez que cambia el punto o la orientación.
  useEffect(() => {
    if (!punto) return;
    const resultado = calcularAreaTrabajo({ ...punto, rumbo }, vehiculo);    onChange({ posicion: punto, ...resultado });

    const map = mapRef.current;
    if (!map || !mapaListo) return;

    map.getSource("area-trabajo").setData({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[...resultado.area, resultado.area[0]]] },
      properties: {},
    });

    if (!markerRef.current) markerRef.current = new maplibregl.Marker({ color: "#0b5fff" });
    markerRef.current.setLngLat([punto.lng, punto.lat]).addTo(map);
  }, [punto, rumbo, vehiculo, mapaListo, onChange]);
  const usarGps = async () => {
    setError(null);
    setUbicando(true);
    try {
      const posicion = await obtenerPosicion();
      setPunto({ lat: posicion.lat, lng: posicion.lng, precision: posicion.precision });
      mapRef.current?.flyTo({ center: [posicion.lng, posicion.lat], zoom: ZOOM_DETALLE });
    } catch (err) {
      setError(err.message);
    } finally {
      setUbicando(false);
    }
  };

  return (
    <div className="ubicacion-picker">
      <div ref={containerRef} className="ubicacion-mapa" />

      <p className="permiso-detalle">
        {punto
          ? "Toca otro punto del mapa si quieres mover el camión."
          : "Toca en el mapa dónde estará el camión, o usa tu ubicación actual."}
      </p>

      <button type="button" className="btn-secondary" onClick={usarGps} disabled={ubicando}>
        {ubicando ? "Obteniendo ubicación…" : "📍 Usar mi ubicación actual"}
      </button>

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
    </div>
  );
}