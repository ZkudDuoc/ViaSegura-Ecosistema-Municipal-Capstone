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

const SANTIAGO_CENTER = [-70.6483, -33.4569];

// "Servicio en operativo": el color y el tamaño dependen del progreso del
// servicio (0 = recién iniciado, 1 = llegó al fin de su ventana).
const COLOR_POR_PROGRESO = [
  "interpolate", ["linear"], ["get", "progreso"],
  0, "#16a34a",
  0.5, "#f59e0b",
  1, "#dc2626",
];
const RADIO_POR_PROGRESO = ["interpolate", ["linear"], ["get", "progreso"], 0, 8, 1, 14];
const PULSO_MS = 2000;

function calcularProgreso(op, ahora) {
  const inicio = new Date(op.inicio).getTime();
  const fin = new Date(op.fin_programado).getTime();
  if (!(fin > inicio)) return 1;
  return Math.min(1, Math.max(0, (ahora - inicio) / (fin - inicio)));
}

// Centro aproximado del polígono: promedio de los vértices del anillo
// exterior (el último vértice repite el primero, por eso se descarta).
function centroide(area) {
  const anillo = area?.coordinates?.[0];
  if (!anillo || anillo.length < 2) return null;
  const vertices = anillo.slice(0, -1);
  const [sumLng, sumLat] = vertices.reduce(([x, y], [lng, lat]) => [x + lng, y + lat], [0, 0]);
  return [sumLng / vertices.length, sumLat / vertices.length];
}

function construirFeatures(operativos, ahora) {
  const puntos = [];
  const areas = [];

  operativos.forEach((op) => {
    const properties = {
      id: op.id,
      progreso: calcularProgreso(op, ahora),
      restanteMin: Math.round((new Date(op.fin_programado).getTime() - ahora) / 60000),
    };
    const centro = centroide(op.area);
    if (centro) {
      puntos.push({ type: "Feature", geometry: { type: "Point", coordinates: centro }, properties });
    }
    if (op.area) {
      areas.push({ type: "Feature", geometry: op.area, properties });
    }
  });

  return {
    puntos: { type: "FeatureCollection", features: puntos },
    areas: { type: "FeatureCollection", features: areas },
  };
}

export default function MapView({ height = 420, operativos = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const operativosRef = useRef(operativos);

  useEffect(() => {
    operativosRef.current = operativos;
  }, [operativos]);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: SANTIAGO_CENTER,
      zoom: 11,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    let listo = false;
    const vacio = { type: "FeatureCollection", features: [] };

    const actualizarDatos = () => {
      if (!listo) return;
      const { puntos, areas } = construirFeatures(operativosRef.current, Date.now());
      map.getSource("operativos")?.setData(puntos);
      map.getSource("operativos-area")?.setData(areas);
    };

    map.on("load", () => {
      map.addSource("operativos-area", { type: "geojson", data: vacio });
      map.addSource("operativos", { type: "geojson", data: vacio });

      map.addLayer({
        id: "operativos-area",
        type: "fill",
        source: "operativos-area",
        paint: { "fill-color": COLOR_POR_PROGRESO, "fill-opacity": 0.15 },
      });
      map.addLayer({
        id: "operativos-pulso",
        type: "circle",
        source: "operativos",
        paint: {
          "circle-color": COLOR_POR_PROGRESO,
          "circle-radius": RADIO_POR_PROGRESO,
          "circle-opacity": 0.5,
        },
      });
      map.addLayer({
        id: "operativos-centro",
        type: "circle",
        source: "operativos",
        paint: {
          "circle-color": COLOR_POR_PROGRESO,
          "circle-radius": RADIO_POR_PROGRESO,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      map.on("click", "operativos-centro", (e) => {
        const { restanteMin } = e.features[0].properties;
        const texto =
          restanteMin >= 0 ? `Quedan ${restanteMin} min de servicio` : `Excedido por ${-restanteMin} min`;
        new maplibregl.Popup().setLngLat(e.lngLat).setText(texto).addTo(map);
      });
      map.on("mouseenter", "operativos-centro", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "operativos-centro", () => (map.getCanvas().style.cursor = ""));

      listo = true;
      actualizarDatos();
    });

    // Pulso: el círculo exterior se expande y se desvanece en ciclos de PULSO_MS.
    let frame;
    const animar = (t) => {
      if (listo) {
        const fase = (t % PULSO_MS) / PULSO_MS;
        map.setPaintProperty("operativos-pulso", "circle-radius", ["*", RADIO_POR_PROGRESO, 1 + fase * 1.5]);
        map.setPaintProperty("operativos-pulso", "circle-opacity", 0.5 * (1 - fase));
      }
      frame = requestAnimationFrame(animar);
    };
    frame = requestAnimationFrame(animar);

    // El progreso (color/tamaño) avanza en vivo aunque el Backend no haya respondido de nuevo.
    const intervalo = setInterval(actualizarDatos, 1000);

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(intervalo);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height, borderRadius: 12, overflow: "hidden" }} />;
}