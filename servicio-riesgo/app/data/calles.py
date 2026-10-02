"""Carga de la red de calles reales para el score por tramo (Semana 5).

Fuente: "Flujo Vehicular en el Área Metropolitana de Santiago" de SECTRA,
publicado por el Observatorio de Ciudades UC en ArcGIS Hub — verificado
en esta sesión: 33.600 tramos, campo `flujo_v_h` (flujo vehicular por
hora, congestión real medida) con geometría real por calle. Ver la
investigación completa en `docs/investigacion-datos-riesgo-congestion.md`.
Licencia: CC BY-NC 4.0 (uso académico, no comercial) — atribuir a SECTRA /
Observatorio de Ciudades UC.

Se consulta por el mismo bbox que usan los datasets simulados de
incidentes y censo (RANGO_LAT/RANGO_LON), así que los tramos que llegan
son calles reales dentro de esa misma zona (Vitacura, Providencia,
Santiago Centro, Ñuñoa, según el bbox vigente).

Igual que con incidentes y censo (riesgo #5 del plan: fuente real no
disponible a tiempo), si SECTRA no responde al generar el dataset (se
probó inestabilidad real con Overpass/OSM esta semana, por eso la misma
cautela se aplica aquí) se cae a una red de calles simulada equivalente,
para que el servicio no dependa de la disponibilidad de un tercero para
poder arrancar.
"""

import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import LineString

from app.data.incidents import RANGO_LAT, RANGO_LON

SECTRA_FEATURE_SERVER = (
    "https://services9.arcgis.com/kKJR3Qt68ohAWuet/arcgis/rest/services/"
    "Calculo_de_flujo_vehicular_en_AMS/FeatureServer/0/query"
)
PAGINA = 1000
TIMEOUT_S = 20
REQUIRED_COLUMNS = ["nombre", "comuna", "clase", "flujo_v_h"]


def _consultar_sectra(offset: int) -> dict:
    params = {
        "where": "1=1",
        "geometry": f"{RANGO_LON[0]},{RANGO_LAT[0]},{RANGO_LON[1]},{RANGO_LAT[1]}",
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "nombre,comuna,clase,flujo_v_h,length",
        "outSR": "4326",
        "resultOffset": offset,
        "resultRecordCount": PAGINA,
        "f": "json",
    }
    url = SECTRA_FEATURE_SERVER + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "ViaSegura-ServicioRiesgo/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
        return json.loads(r.read())


def _descargar_calles_reales() -> list[dict]:
    """Descarga, paginando, todos los tramos SECTRA dentro de RANGO_LAT/RANGO_LON."""
    filas = []
    offset = 0
    while True:
        data = _consultar_sectra(offset)
        features = data.get("features", [])
        if not features:
            break
        for f in features:
            attrs, geom = f.get("attributes", {}), f.get("geometry")
            paths = (geom or {}).get("paths") or []
            if not paths or len(paths[0]) < 2:
                continue
            filas.append(
                {
                    "nombre": attrs.get("nombre"),
                    "comuna": attrs.get("comuna"),
                    "clase": attrs.get("clase"),
                    "flujo_v_h": attrs.get("flujo_v_h"),
                    "geometry": LineString(paths[0]),
                }
            )
        if not data.get("exceededTransferLimit") and len(features) < PAGINA:
            break
        offset += PAGINA
    return filas


def _generar_calles_simuladas(n: int = 120, seed: int = 11) -> list[dict]:
    """Respaldo si SECTRA no responde: grilla simulada de calles dentro del
    mismo bbox, con flujo vehicular aleatorio — misma idea que
    generar_incidentes_simulados/generar_censo_simulado."""
    rng = np.random.default_rng(seed)
    filas = []
    for i in range(n // 2):
        lat = rng.uniform(*RANGO_LAT)
        lon0, lon1 = RANGO_LON
        filas.append(
            {
                "nombre": f"CALLE SIMULADA {i + 1}",
                "comuna": "Comuna Piloto",
                "clase": "CALLE",
                "flujo_v_h": int(rng.uniform(50, 3000)),
                "geometry": LineString([(lon0, lat), (lon1, lat)]),
            }
        )
    for i in range(n - n // 2):
        lon = rng.uniform(*RANGO_LON)
        lat0, lat1 = RANGO_LAT
        filas.append(
            {
                "nombre": f"AVENIDA SIMULADA {i + 1}",
                "comuna": "Comuna Piloto",
                "clase": "AVDA",
                "flujo_v_h": int(rng.uniform(50, 3000)),
                "geometry": LineString([(lon, lat0), (lon, lat1)]),
            }
        )
    return filas


def generar_calles(path: Path) -> None:
    """Genera el GeoJSON de calles si el archivo no existe: intenta SECTRA
    (datos reales), y si falla cae a una red simulada equivalente."""
    if path.exists():
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        filas = _descargar_calles_reales()
        if not filas:
            raise ValueError("SECTRA respondió sin tramos dentro del bbox")
        origen = "sectra_real"
    except (urllib.error.URLError, TimeoutError, ValueError, OSError, json.JSONDecodeError) as exc:
        import logging

        logging.getLogger("servicio-riesgo").warning(
            "No se pudo descargar la red de calles real de SECTRA (%s); "
            "se usa una red simulada como respaldo.",
            exc,
        )
        filas = _generar_calles_simuladas()
        origen = "simulado_respaldo"

    gdf = gpd.GeoDataFrame(filas, crs="EPSG:4326")
    gdf["origen_dato"] = origen
    gdf.to_file(path, driver="GeoJSON")


def cargar_calles(path: Path) -> gpd.GeoDataFrame:
    """Carga y limpia la red de calles: descarta geometrías/nombres nulos
    y normaliza el flujo vehicular a una escala 0-1 (congestion_normalizada),
    igual que la densidad poblacional en censo.py."""
    gdf = gpd.read_file(path)

    missing = set(REQUIRED_COLUMNS) - set(gdf.columns)
    if missing:
        raise ValueError(f"Dataset de calles: faltan columnas {missing}")

    gdf = gdf.dropna(subset=["nombre", "geometry", "flujo_v_h"])
    gdf = gdf[gdf["flujo_v_h"] >= 0]

    flujo_min, flujo_max = gdf["flujo_v_h"].min(), gdf["flujo_v_h"].max()
    rango = flujo_max - flujo_min
    gdf["congestion_normalizada"] = (
        (gdf["flujo_v_h"] - flujo_min) / rango if rango > 0 else 0.0
    )

    return gdf.reset_index(drop=True)
