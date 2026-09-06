"""Score de riesgo espacio-temporal (Semana 2).

Cruza el polígono de una solicitud contra los incidentes históricos
dentro de esa zona y ventana de tiempo, y contra la densidad poblacional
de las manzanas censales que la intersectan. Se ejecuta en cada request
sobre los datasets ya cargados en memoria (app.state) — no hay I/O ni
batch de por medio, por eso responde en tiempo real.

Las constantes de esta primera versión (ventana temporal, tau de
saturación, umbrales de nivel) son valores razonables de partida; el
plan reserva su ajuste fino para la calibración de Semana 3.
"""

import math
from datetime import date

import geopandas as gpd
from shapely.geometry.base import BaseGeometry

GRAVEDAD_PESOS = {"baja": 1, "media": 2, "alta": 3}

VENTANA_DIAS = 45
RISK_TAU = 6.0
NIVEL_UMBRAL_BAJO_MEDIO = 34
NIVEL_UMBRAL_MEDIO_ALTO = 67


def _distancia_circular_dias(fecha_a: date, fecha_b: date) -> int:
    """Distancia en días entre dos fechas ignorando el año (circular sobre
    365 días), para capturar patrones estacionales ("misma época del año")
    en vez de exigir coincidencia exacta de año con el dataset histórico."""
    dia_anio_a = fecha_a.timetuple().tm_yday
    dia_anio_b = fecha_b.timetuple().tm_yday
    diff_days = abs(dia_anio_a - dia_anio_b)
    return min(diff_days, 365 - diff_days)


def _nivel_desde_score(risk_score: float) -> str:
    if risk_score < NIVEL_UMBRAL_BAJO_MEDIO:
        return "bajo"
    if risk_score < NIVEL_UMBRAL_MEDIO_ALTO:
        return "medio"
    return "alto"


def calcular_score(
    gdf_incidentes: gpd.GeoDataFrame,
    gdf_censo: gpd.GeoDataFrame,
    poligono: BaseGeometry,
    fecha: date,
    ventana_dias: int = VENTANA_DIAS,
) -> dict:
    incidentes_en_zona = gdf_incidentes[gdf_incidentes.within(poligono)]

    if len(incidentes_en_zona) > 0:
        distancias = incidentes_en_zona["fecha"].apply(
            lambda f: _distancia_circular_dias(f.date(), fecha)
        )
        incidentes_en_ventana = incidentes_en_zona[distancias <= ventana_dias]
    else:
        incidentes_en_ventana = incidentes_en_zona

    pesos = (
        incidentes_en_ventana["gravedad"]
        .astype(str)
        .map(GRAVEDAD_PESOS)
        .fillna(0)
    )
    suma_ponderada = float(pesos.sum())

    risk_score = round(100 * (1 - math.exp(-suma_ponderada / RISK_TAU)), 2)

    manzanas_en_zona = gdf_censo[gdf_censo.intersects(poligono)]
    if len(manzanas_en_zona) > 0:
        congestion_score = round(
            float(manzanas_en_zona["densidad_normalizada"].mean()) * 100, 2
        )
    else:
        congestion_score = 0.0

    return {
        "risk_score": risk_score,
        "congestion_score": congestion_score,
        "nivel": _nivel_desde_score(risk_score),
        "n_incidentes_considerados": int(len(incidentes_en_ventana)),
    }
