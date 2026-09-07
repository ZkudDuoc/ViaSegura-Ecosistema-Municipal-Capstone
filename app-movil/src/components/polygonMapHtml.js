// HTML embebido para el WebView: mismo MapLibre GL JS + estilo OSM que usa
// el dashboard (dashboard/src/components/MapView.jsx), así evitamos una
// librería de mapas nativa (y su costo de compatibilidad/API) para algo que
// ya sabemos que funciona.
const SANTIAGO_CENTER = [-70.6483, -33.4569];

export function buildPolygonMapHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no" />
  <link href="https://unpkg.com/maplibre-gl@4.5.2/dist/maplibre-gl.css" rel="stylesheet" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/maplibre-gl@4.5.2/dist/maplibre-gl.js"></script>
  <script>
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

    const map = new maplibregl.Map({
      container: "map",
      style: OSM_STYLE,
      center: ${JSON.stringify(SANTIAGO_CENTER)},
      zoom: 11,
    });

    let points = [];
    let markers = [];

    function send() {
      window.ReactNativeWebView.postMessage(JSON.stringify(points));
    }

    function redrawMarkers() {
      markers.forEach((m) => m.remove());
      markers = points.map((p) => new maplibregl.Marker({ color: "#0B5FFF" }).setLngLat(p).addTo(map));
    }

    function redrawPolygon() {
      const source = map.getSource("polygon");
      if (!source) return;
      if (points.length >= 3) {
        source.setData({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [[...points, points[0]]] },
        });
      } else {
        source.setData({ type: "FeatureCollection", features: [] });
      }
    }

    map.on("load", () => {
      map.addSource("polygon", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "polygon-fill",
        type: "fill",
        source: "polygon",
        paint: { "fill-color": "#0B5FFF", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "polygon-line",
        type: "line",
        source: "polygon",
        paint: { "line-color": "#0B5FFF", "line-width": 2 },
      });
    });

    map.on("click", (e) => {
      points.push([e.lngLat.lng, e.lngLat.lat]);
      redrawMarkers();
      redrawPolygon();
      send();
    });

    window.undoPoint = function () {
      points.pop();
      redrawMarkers();
      redrawPolygon();
      send();
    };

    window.resetPoints = function () {
      points = [];
      redrawMarkers();
      redrawPolygon();
      send();
    };
  </script>
</body>
</html>`;
}
