"""Riesgo y congestión por tramo de calle real (Semana 5).

Complementa /score (que evalúa UN polígono puntual por solicitud) con una
capa agregada para pintar el mapa: cada calle real (ver app/data/calles.py,
datos de SECTRA) recibe su propio índice de riesgo —incidentes históricos
cercanos a esa calle, no a un polígono libre— y su congestión, que para
calles reales usa el flujo vehicular medido (congestion_normalizada de
calles.py) en vez del proxy de densidad poblacional que usa /score.

Semana 5 (integración de la Parte B): como cada calle de SECTRA ya trae
su `comuna` real, el riesgo simulado de cada tramo se escala por el
factor de criminalidad REAL de esa comuna (ver
app/data/criminalidad_real.py, capturado a mano del CEAD porque no tiene
API) — una calle en Providencia o Santiago (comunas con tasa real por
sobre el promedio nacional) pesa más que la misma cantidad de incidentes
simulados en Las Condes o Vitacura (bajo el promedio). `datos_reales_cerca()`
(más abajo) es lo que le permite a `/score` y a `/ranking-inspecciones`
usar este mismo factor cuando el polígono de la solicitud cae cerca de
una calle real — el censo simulado no tiene comuna real asociada a sus
manzanas, así que sin esto ninguno de los dos podría resolverla solo.

Se calcula una sola vez al levantar el servicio (mismo patrón que
clustering.py) y se sirve desde caché en GET /calles-riesgo.
"""

import math
import warnings

import geopandas as gpd
import pandas as pd
from shapely.geometry.base import BaseGeometry
from shapely.geometry import mapping

from app.data.censo import METROS_POR_GRADO_LAT, METROS_POR_GRADO_LON
from app.data.criminalidad_real import factor_para_comuna
from app.services.scoring import (
    BUFFER_BUSQUEDA_M,
    GRAVEDAD_PESOS,
    RISK_TAU,
    _expandir_poligono,
    _nivel_desde_score,
    calcular_score,
)

BUFFER_CALLE_M = 15  # corredor a cada lado de la calle donde se buscan incidentes


def datos_reales_cerca(
    poligono: BaseGeometry, gdf_calles: gpd.GeoDataFrame, buffer_m: float
) -> dict:
    """Busca calles reales de SECTRA que toquen `poligono` (expandido
    `buffer_m` metros, mismo criterio que BUFFER_BUSQUEDA_M de scoring.py)
    y devuelve congestión real (promedio del flujo vehicular de esas
    calles) y la comuna real más frecuente entre ellas — para que
    /ranking-inspecciones use datos reales en vez del proxy de /score
    cuando una obra cae cerca de una calle real. Si no hay ninguna calle
    cerca, devuelve comuna=None y congestion_score=None (el llamador
    decide el respaldo)."""
    if len(gdf_calles) == 0:
        return {"comuna": None, "congestion_score": None, "n_calles_cercanas": 0}

    poligono_expandido = _expandir_poligono(poligono, buffer_m)
    cercanas = gdf_calles[gdf_calles.intersects(poligono_expandido)]
    if len(cercanas) == 0:
        return {"comuna": None, "congestion_score": None, "n_calles_cercanas": 0}

    comunas_validas = cercanas["comuna"][cercanas["comuna"].astype(bool)]
    comuna = comunas_validas.mode().iloc[0] if len(comunas_validas) > 0 else None
    congestion_score = round(float(cercanas["congestion_normalizada"].mean()) * 100, 2)
    return {
        "comuna": comuna,
        "congestion_score": congestion_score,
        "n_calles_cercanas": int(len(cercanas)),
    }


def evaluar_score_con_datos_reales(
    gdf_incidentes: gpd.GeoDataFrame,
    gdf_censo: gpd.GeoDataFrame,
    gdf_calles: gpd.GeoDataFrame,
    poligono: BaseGeometry,
    fecha,
    **kwargs_score,
) -> dict:
    """Mismo flujo que usa POST /score (main.py) y /ranking-inspecciones:
    busca si hay una calle real (SECTRA) cerca del polígono, y si la hay,
    usa su congestión real y el factor de criminalidad real de esa
    comuna (CEAD) en vez del proxy de densidad poblacional. Se deja acá,
    compartida, para que scripts/generar_escenarios_demo.py y los tests
    no reimplementen esta lógica aparte y terminen desincronizados de lo
    que el endpoint real responde — ya pasó una vez (ver Semana 5)."""
    reales = datos_reales_cerca(poligono, gdf_calles, BUFFER_BUSQUEDA_M)
    factor_real = factor_para_comuna(reales["comuna"])

    resultado = calcular_score(
        gdf_incidentes, gdf_censo, poligono, fecha,
        factor_criminalidad=factor_real, comuna=reales["comuna"], **kwargs_score,
    )
    if reales["congestion_score"] is not None:
        resultado["congestion_score"] = reales["congestion_score"]

    resultado["comuna_detectada"] = reales["comuna"]
    resultado["fuente_congestion"] = (
        f"real (SECTRA, {reales['n_calles_cercanas']} calles cercanas)"
        if reales["congestion_score"] is not None
        else "estimada (densidad poblacional simulada)"
    )
    return resultado


def calcular_riesgo_calles(
    gdf_incidentes: gpd.GeoDataFrame,
    gdf_calles: gpd.GeoDataFrame,
    buffer_calle_m: float = BUFFER_CALLE_M,
) -> list[dict]:
    if len(gdf_calles) == 0:
        return []

    buffer_grados = (
        (buffer_calle_m / METROS_POR_GRADO_LAT) + (buffer_calle_m / METROS_POR_GRADO_LON)
    ) / 2
    # geopandas avisa que bufear en un CRS geográfico (grados) no es exacto
    # — ya convertimos metros->grados arriba (misma aproximación que usan
    # censo.py y scoring.py en todo el proyecto), así que es la advertencia
    # esperada, no un error.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        geometria_corredores = gdf_calles.geometry.buffer(buffer_grados)
    corredores = gpd.GeoDataFrame(
        {"indice_calle": gdf_calles.index}, geometry=geometria_corredores, crs=gdf_calles.crs,
    )

    cruce = gpd.sjoin(
        gdf_incidentes[["geometry", "gravedad"]], corredores[["geometry", "indice_calle"]],
        how="inner", predicate="within",
    )
    pesos = cruce["gravedad"].astype(str).map(GRAVEDAD_PESOS).fillna(0)
    suma_por_calle = pesos.groupby(cruce["indice_calle"]).sum()
    conteo_por_calle = cruce.groupby("indice_calle").size()

    calles = []
    for idx, calle in gdf_calles.iterrows():
        comuna = calle["comuna"] or None
        factor_real = factor_para_comuna(comuna)
        suma = float(suma_por_calle.get(idx, 0.0)) * factor_real
        risk_score = round(100 * (1 - math.exp(-suma / RISK_TAU)), 2)
        calles.append(
            {
                "calle_id": int(idx),
                "nombre": calle["nombre"],
                "comuna": comuna,
                "risk_score": risk_score,
                "nivel": _nivel_desde_score(risk_score),
                "congestion_score": round(float(calle["congestion_normalizada"]) * 100, 2),
                "flujo_vehicular_hora": (
                    None if pd.isna(calle["flujo_v_h"]) else float(calle["flujo_v_h"])
                ),
                "n_incidentes": int(conteo_por_calle.get(idx, 0)),
                "factor_criminalidad_real": factor_real,
                "geometry_geojson": mapping(calle.geometry),
            }
        )

    calles.sort(key=lambda c: c["risk_score"], reverse=True)
    return calles
