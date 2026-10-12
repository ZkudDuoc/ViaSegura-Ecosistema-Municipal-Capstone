import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./MapView.css";

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

// Vista inicial: Santiago Centro, la comuna principal del sistema.
const SANTIAGO_CENTRO = [-70.6505, -33.4489];
const ZOOM_INICIAL = 13.5;
const VACIO = { type: "FeatureCollection", features: [] };

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
const ZOOM_FOCO = 17;

// Calles del servicio de riesgo: el color ya viene calculado por calle según
// la métrica elegida (riesgo o congestión), con la misma escala de la leyenda.
const COLOR_CALLE = ["coalesce", ["get", "color"], "#94a3b8"];
const NIVEL_TEXTO = { bajo: "bajo", medio: "medio", alto: "alto" };

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

const numero = (valor) => (valor === null || valor === undefined || valor === "null" ? null : Number(valor));

// Contenido del popup de una calle, armado con nodos de texto (no HTML) porque
// los nombres vienen de un dataset externo. En palabras simples: nivel primero,
// puntaje después.
function contenidoCalle(p) {
  const contenedor = document.createElement("div");
  contenedor.className = "popup-calle";
  const riesgo = numero(p.risk_score);
  const congestion = numero(p.congestion_score);
  const flujo = numero(p.flujo_vehicular_hora);
  const lineas = [
    [p.nombre || "Calle sin nombre", true],
    [p.comuna ? `Comuna: ${p.comuna === "SANTIAGO" ? "Santiago Centro" : p.comuna}` : null, false],
    [
      riesgo !== null ? `Riesgo de delitos: ${NIVEL_TEXTO[p.nivel] ?? p.nivel ?? "sin dato"} (${Math.round(riesgo)} de 100)` : null,
      false,
    ],
    [
      congestion !== null
        ? `Congestión: ${NIVEL_TEXTO[p.nivel_congestion] ?? p.nivel_congestion ?? "sin dato"} (${Math.round(congestion)} de 100)`
        : null,
      false,
    ],
    [flujo !== null ? `Pasan unos ${Math.round(flujo).toLocaleString("es-CL")} vehículos por hora` : null, false],
  ];
  lineas.forEach(([texto, negrita]) => {
    if (!texto) return;
    const linea = document.createElement(negrita ? "strong" : "div");
    linea.textContent = texto;
    contenedor.appendChild(linea);
  });
  return contenedor;
}

// `foco`: punto { lat, lng } a destacar (ej. una alerta de pánico). Cada vez
// que cambia, el mapa vuela ahí y pone un marcador rojo.
// `calles`: FeatureCollection de calles con riesgo, cada una con su `color`
// (null = capa oculta).
export default function MapView({ height = 420, operativos = [], foco = null, calles = null }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const operativosRef = useRef(operativos);
  const callesRef = useRef(calles);
  const [mapaListo, setMapaListo] = useState(false);
  const listoRef = useRef(false);
  const encuadradoRef = useRef(false);
  const marcadorFocoRef = useRef(null);

  // Encuadra el mapa sobre todas las áreas de los servicios activos.
  const encuadrarOperativos = useCallback(() => {
    const map = mapRef.current;
    const coords = operativosRef.current.flatMap((op) => op.area?.coordinates?.[0] ?? []);
    if (!map || coords.length === 0) return false;
    const bounds = coords.reduce(
      (b, coord) => b.extend(coord),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    );
    map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 800 });
    return true;
  }, []);

  useEffect(() => {
    operativosRef.current = operativos;
    // Se encuadra una sola vez al llegar los primeros servicios, para no mover
    // el mapa en cada refresco mientras el operador lo está mirando.
    if (listoRef.current && !encuadradoRef.current && operativos.length) {
      encuadradoRef.current = encuadrarOperativos();
    }
  }, [operativos, encuadrarOperativos]);

  useEffect(() => {
    callesRef.current = calles;
    const map = mapRef.current;
    if (!map || !listoRef.current) return;
    map.getSource("calles-riesgo")?.setData(calles ?? VACIO);
    ["calles-riesgo", "calles-riesgo-toque"].forEach((capa) =>
      map.setLayoutProperty(capa, "visibility", calles ? "visible" : "none")
    );
  }, [calles]);

  useEffect(() => {
    const map = mapRef.current;
    if (!foco || !map) return;
    map.flyTo({ center: [foco.lng, foco.lat], zoom: ZOOM_FOCO });
    if (!marcadorFocoRef.current) marcadorFocoRef.current = new maplibregl.Marker({ color: "#dc2626" });
    marcadorFocoRef.current.setLngLat([foco.lng, foco.lat]).addTo(map);
  }, [foco]);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: SANTIAGO_CENTRO,
      zoom: ZOOM_INICIAL,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const actualizarDatos = () => {
      if (!listoRef.current) return;
      const { puntos, areas } = construirFeatures(operativosRef.current, Date.now());
      map.getSource("operativos")?.setData(puntos);
      map.getSource("operativos-area")?.setData(areas);
    };

    map.on("load", () => {
      // Las calles van primero: quedan debajo de los servicios activos.
      map.addSource("calles-riesgo", { type: "geojson", data: callesRef.current ?? VACIO });
      map.addLayer({
        id: "calles-riesgo",
        type: "line",
        source: "calles-riesgo",
        layout: { "line-cap": "round", "line-join": "round", visibility: callesRef.current ? "visible" : "none" },
        paint: {
          "line-color": COLOR_CALLE,
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.5, 16, 5],
          "line-opacity": 0.85,
        },
      });
      // Franja invisible y más ancha sobre cada calle: las líneas son delgadas
      // y así es fácil tocarlas con el mouse o con el dedo.
      map.addLayer({
        id: "calles-riesgo-toque",
        type: "line",
        source: "calles-riesgo",
        layout: { visibility: callesRef.current ? "visible" : "none" },
        paint: { "line-width": 16, "line-opacity": 0 },
      });

      map.addSource("operativos-area", { type: "geojson", data: VACIO });
      map.addSource("operativos", { type: "geojson", data: VACIO });

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
      map.on("click", "calles-riesgo-toque", (e) => {
        // Si se tocó un servicio activo, gana su popup (está encima de la calle).
        if (map.queryRenderedFeatures(e.point, { layers: ["operativos-centro"] }).length) return;
        new maplibregl.Popup().setLngLat(e.lngLat).setDOMContent(contenidoCalle(e.features[0].properties)).addTo(map);
      });
      ["operativos-centro", "calles-riesgo-toque"].forEach((capa) => {
        map.on("mouseenter", capa, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", capa, () => (map.getCanvas().style.cursor = ""));
      });

      listoRef.current = true;
      setMapaListo(true);
      actualizarDatos();
      if (operativosRef.current.length) encuadradoRef.current = encuadrarOperativos();
    });

    // Pulso: el círculo exterior se expande y se desvanece en ciclos de PULSO_MS.
    let frame;
    const animar = (t) => {
      if (listoRef.current) {
        const fase = (t % PULSO_MS) / PULSO_MS;
        map.setPaintProperty("operativos-pulso", "circle-radius", ["*", RADIO_POR_PROGRESO, 1 + fase * 1.5]);
        map.setPaintProperty("operativos-pulso", "circle-opacity", 0.5 * (1 - fase));
      }
      frame = requestAnimationFrame(animar);
    };
    frame = requestAnimationFrame(animar);

    // El progreso (color/tamaño) avanza en vivo aunque el Backend no haya respondido de nuevo.
    const intervalo = setInterval(actualizarDatos, 1000);

    // MapLibre solo se reajusta cuando cambia la ventana; si cambia solo el
    // contenedor (o el mapa se creó antes de que la página tuviera su ancho
    // final), el lienzo quedaría cortado.
    const observador = new ResizeObserver(() => map.resize());
    observador.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(intervalo);
      observador.disconnect();
      listoRef.current = false;
      encuadradoRef.current = false;
      marcadorFocoRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [encuadrarOperativos]);

  return (
    <div className="mapa-contenedor" style={{ height }}>
      <div ref={containerRef} className="mapa-lienzo" />
      {!mapaListo && (
        <div className="mapa-cargando" role="status">
          Cargando mapa…
        </div>
      )}
      {operativos.length > 0 && (
        <button type="button" className="mapa-centrar" onClick={encuadrarOperativos}>
          Ver servicios activos
        </button>
      )}
    </div>
  );
}