const METROS_POR_GRADO_LAT = 111_320;

// Supuesto a validar con el profesor: distancia reglamentaria de conos de
// seguridad alrededor del camión, por cada lado.
export const DISTANCIA_CONOS_M = 3;

// Medidas estándar de camión, usadas hasta que el chofer elija uno de sus
// vehículos registrados (tarea 1c).
export const VEHICULO_POR_DEFECTO = { ancho_m: 2.6, largo_m: 12 };

// Margen por error del GPS al confirmar la llegada.
export const TOLERANCIA_LLEGADA_M = 50;

const MENSAJES_ERROR_GPS = {
  1: "Debes permitir el acceso a la ubicación",
  2: "No se pudo determinar la ubicación (sin señal GPS)",
  3: "Se agotó el tiempo para obtener la ubicación",
};

export function obtenerPosicion() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Este navegador no permite obtener la ubicación"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: pos.coords.accuracy,
          rumbo: pos.coords.heading,
        }),
      (err) => reject(new Error(MENSAJES_ERROR_GPS[err.code] ?? "No se pudo obtener la ubicación")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function desplazar({ lat, lng }, esteM, norteM) {
  return [
    lng + esteM / (METROS_POR_GRADO_LAT * Math.cos((lat * Math.PI) / 180)),
    lat + norteM / METROS_POR_GRADO_LAT,
  ];
}

// Rectángulo de trabajo centrado en el camión: sus medidas más la distancia
// de conos por cada lado. El largo se alinea con el rumbo del GPS si viene
// (solo lo entrega en movimiento); si no, queda orientado norte-sur.
export function calcularAreaTrabajo(posicion, vehiculo = VEHICULO_POR_DEFECTO, distanciaConosM = DISTANCIA_CONOS_M) {
  const anchoTotalM = Number(vehiculo.ancho_m) + 2 * distanciaConosM;
  const largoTotalM = Number(vehiculo.largo_m) + 2 * distanciaConosM;
  const rumbo = Number.isFinite(posicion.rumbo) ? (posicion.rumbo * Math.PI) / 180 : 0;

  const medioAncho = anchoTotalM / 2;
  const medioLargo = largoTotalM / 2;
  const esquinas = [
    [-medioAncho, -medioLargo],
    [medioAncho, -medioLargo],
    [medioAncho, medioLargo],
    [-medioAncho, medioLargo],
  ];

  // x = a lo ancho (derecha del camión), y = a lo largo (hacia adelante),
  // rotados según el rumbo (0 = norte, sentido horario).
  const area = esquinas.map(([x, y]) => {
    const este = x * Math.cos(rumbo) + y * Math.sin(rumbo);
    const norte = -x * Math.sin(rumbo) + y * Math.cos(rumbo);
    return desplazar(posicion, este, norte);
  });

  return { area, anchoTotalM, largoTotalM };
}

// Distancia aproximada en metros (suficiente para distancias cortas).
export function distanciaMetros(a, b) {
  const x = (b.lng - a.lng) * METROS_POR_GRADO_LAT * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const y = (b.lat - a.lat) * METROS_POR_GRADO_LAT;
  return Math.hypot(x, y);
}

function puntoEnPoligono({ lat, lng }, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    const cruza = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

function centroide(anillo) {
  const vertices = anillo.slice(0, -1);
  const suma = vertices.reduce((acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }), { lng: 0, lat: 0 });
  return { lng: suma.lng / vertices.length, lat: suma.lat / vertices.length };
}

// Geofencing de llegada: dentro del polígono del permiso, o a menos de
// TOLERANCIA_LLEGADA_M de su centro (margen por error del GPS).
export function estaEnArea(posicion, area) {
  const anillo = area?.coordinates?.[0] ?? [];
  if (anillo.length < 4) return { dentro: false, distanciaM: Infinity };
  if (puntoEnPoligono(posicion, anillo)) return { dentro: true, distanciaM: 0 };

  const distanciaM = distanciaMetros(posicion, centroide(anillo));
  return { dentro: distanciaM <= TOLERANCIA_LLEGADA_M, distanciaM };
}