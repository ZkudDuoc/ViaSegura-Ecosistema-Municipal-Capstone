import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

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

// Mapa de solo lectura centrado en un punto { lat, lng } con un marcador.
export default function PuntoMapa({ punto, height = 240, color = "#dc2626" }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !punto) return undefined;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [punto.lng, punto.lat],
      zoom: 17,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    new maplibregl.Marker({ color }).setLngLat([punto.lng, punto.lat]).addTo(map);

    return () => map.remove();
  }, [punto, color]);

  if (!punto) return <p className="detalle-vacio">Sin ubicación registrada.</p>;

  return <div ref={containerRef} style={{ width: "100%", height, borderRadius: 12, overflow: "hidden" }} />;
}