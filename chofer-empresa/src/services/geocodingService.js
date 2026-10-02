// Búsqueda de direcciones con Nominatim (OpenStreetMap), sin API key.
// Política de uso: máximo 1 request por segundo — por eso el componente
// espera a que la persona termine de escribir antes de buscar.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

// Prioriza resultados en la Región Metropolitana sin excluir el resto de Chile.
const VIEWBOX_SANTIAGO = "-70.95,-33.25,-70.45,-33.65";

export async function buscarDirecciones(texto, { signal } = {}) {
  const params = new URLSearchParams({
    q: texto,
    format: "jsonv2",
    countrycodes: "cl",
    viewbox: VIEWBOX_SANTIAGO,
    limit: "5",
    "accept-language": "es",
  });
  const res = await fetch(`${NOMINATIM_URL}/search?${params}`, { signal });
  if (!res.ok) throw new Error("No se pudo buscar la dirección");
  const resultados = await res.json();
  return resultados.map((r) => ({
    id: r.place_id,
    etiqueta: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
}

// Dirección aproximada de un punto (al arrastrar el pin o tocar el mapa).
export async function direccionDePunto({ lat, lng }, { signal } = {}) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "jsonv2",
    "accept-language": "es",
  });
  const res = await fetch(`${NOMINATIM_URL}/reverse?${params}`, { signal });
  if (!res.ok) return null;
  const data = await res.json();
  return data.display_name ?? null;
}

// Nominatim devuelve direcciones muy largas (hasta país): se muestran las 3 primeras partes.
export function acortarDireccion(etiqueta) {
  return etiqueta.split(",").slice(0, 3).join(",").trim();
}