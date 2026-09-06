"""Clustering DBSCAN de incidentes, normalizado por densidad poblacional
(Semana 2).

Un cluster de incidentes en una manzana muy poblada no es necesariamente
más peligroso que uno más pequeño en una manzana casi vacía: el primero
puede ser sólo reflejo de que ahí vive/circula más gente. Por eso el
ranking de "zona roja" no usa el conteo crudo de incidentes por cluster,
sino ese conteo dividido por la densidad poblacional normalizada
(0-1, calculada en app/data/census.py) del área del cluster.

Los clusters se calculan una vez al levantar el servicio (lifespan de
FastAPI) sobre el dataset completo, y se sirven desde caché en
GET /zonas-rojas — es análisis agregado sobre datos históricos, no una
respuesta por-solicitud como /score, así que no hay razón para
recalcularlo en cada request.
"""

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import MultiPoint, mapping
from sklearn.cluster import DBSCAN

EPS_KM = 0.35
MIN_SAMPLES = 5
EARTH_RADIUS_KM = 6371.0088
DENSIDAD_SUAVIZADO = 0.1  # evita división por ~0 en manzanas casi vacías


def _asignar_densidad_censal(
    incidents_gdf: gpd.GeoDataFrame, census_gdf: gpd.GeoDataFrame
) -> pd.Series:
    """Asigna a cada incidente la densidad_normalizada de la manzana censal
    que lo contiene, vía join espacial; incidentes fuera de toda manzana
    conocida reciben la densidad promedio del dataset como fallback neutro."""
    joined = gpd.sjoin(
        incidents_gdf[["geometry"]],
        census_gdf[["geometry", "densidad_normalizada"]],
        how="left",
        predicate="within",
    )
    joined = joined[~joined.index.duplicated(keep="first")]
    fallback = float(census_gdf["densidad_normalizada"].mean())
    return joined["densidad_normalizada"].reindex(incidents_gdf.index).fillna(fallback)


def calcular_zonas_rojas(
    incidents_gdf: gpd.GeoDataFrame,
    census_gdf: gpd.GeoDataFrame,
    eps_km: float = EPS_KM,
    min_samples: int = MIN_SAMPLES,
) -> list[dict]:
    if len(incidents_gdf) == 0:
        return []

    coords_rad = np.radians(incidents_gdf[["latitud", "longitud"]].to_numpy())
    eps_rad = eps_km / EARTH_RADIUS_KM

    labels = DBSCAN(
        eps=eps_rad, min_samples=min_samples, metric="haversine"
    ).fit_predict(coords_rad)

    incidents_gdf = incidents_gdf.copy()
    incidents_gdf["cluster"] = labels
    incidents_gdf["densidad_normalizada"] = _asignar_densidad_censal(
        incidents_gdf, census_gdf
    )

    indices = []
    for cluster_id, grupo in incidents_gdf[incidents_gdf["cluster"] != -1].groupby(
        "cluster"
    ):
        n_incidentes = len(grupo)
        densidad_promedio = float(grupo["densidad_normalizada"].mean())
        indice_riesgo_normalizado = n_incidentes / (
            densidad_promedio + DENSIDAD_SUAVIZADO
        )

        centroide = grupo.geometry.union_all().centroid
        contorno = MultiPoint(list(grupo.geometry)).convex_hull

        indices.append(
            {
                "cluster_id": int(cluster_id),
                "n_incidentes": n_incidentes,
                "densidad_poblacional_normalizada_promedio": round(
                    densidad_promedio, 4
                ),
                "indice_riesgo_normalizado": round(indice_riesgo_normalizado, 4),
                "centroide": {"lat": centroide.y, "lon": centroide.x},
                "contorno_geojson": mapping(contorno),
            }
        )

    if indices:
        umbral_zona_roja = np.mean(
            [z["indice_riesgo_normalizado"] for z in indices]
        )
        for zona in indices:
            zona["es_zona_roja"] = (
                zona["indice_riesgo_normalizado"] >= umbral_zona_roja
            )

    indices.sort(key=lambda z: z["indice_riesgo_normalizado"], reverse=True)
    return indices
