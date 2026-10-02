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

// Mapa de solo lectura con el área de trabajo de un permiso, encuadrado sobre ella.
export default function AreaMapa({ area, height = 280 }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const anillo = area?.coordinates?.[0];
    if (!containerRef.current || !anillo?.length) return undefined;

    const bounds = anillo.reduce(
      (b, coord) => b.extend(coord),
      new maplibregl.LngLatBounds(anillo[0], anillo[0])
    );

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      bounds,
      fitBoundsOptions: { padding: 60, maxZoom: 19 },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("area", { type: "geojson", data: { type: "Feature", geometry: area, properties: {} } });
      map.addLayer({
        id: "area-relleno",
        type: "fill",
        source: "area",
        paint: { "fill-color": "#0b5fff", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "area-borde",
        type: "line",
        source: "area",
        paint: { "line-color": "#0842b0", "line-width": 2 },
      });
    });

    return () => map.remove();
  }, [area]);

  if (!area) return <p className="detalle-vacio">Sin área registrada.</p>;

  return <div ref={containerRef} style={{ width: "100%", height, borderRadius: 12, overflow: "hidden" }} />;
}