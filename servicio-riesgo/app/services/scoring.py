"""Score de riesgo espacio-temporal (Semana 2, calibrado en Semana 3).

Cruza el polígono de una solicitud contra los incidentes históricos
dentro de esa zona y ventana de tiempo, y contra la densidad poblacional
de las manzanas censales que la intersectan. Se ejecuta en cada request
sobre los datasets ya cargados en memoria (app.state) — no hay I/O ni
batch de por medio, por eso responde en tiempo real.

Constantes calibradas en Semana 3 corriendo ~1500 solicitudes simuladas
sobre el dataset real (ver scripts/calibrar_parametros.py): buscan que la
distribución de niveles no quede aplastada en un solo extremo y que un
puñado de incidentes graves ya alcance nivel "alto".
"""

import math
from datetime import date

import geopandas as gpd
from shapely.geometry.base import BaseGeometry

from app.data.censo import METROS_POR_GRADO_LAT, METROS_POR_GRADO_LON

GRAVEDAD_PESOS = {"baja": 1, "media": 2, "alta": 3}

VENTANA_DIAS = 45
# Calibrado con scripts/calibrar_parametros.py: para polígonos del tamaño
# real de una solicitud (15-300m, ya con el buffer mínimo aplicado), la
# suma ponderada cuando SÍ hay algo cerca casi siempre cae entre 1 y 5
# (mediana 2, máximo observado 5 en 1500 solicitudes simuladas). Con
# TAU=2.5: 1 incidente leve -> ~33 (bajo), 2 -> ~55 (medio), 3 -> ~70
# (alto) — un solo incidente "alta" (peso 3) ya alcanza nivel alto, que es
# el comportamiento esperado. Con el TAU=6.0 original, "alto" era
# prácticamente inalcanzable para una solicitud realista (0 casos en los
# mismos 1500 simulados).
RISK_TAU = 2.5
NIVEL_UMBRAL_BAJO_MEDIO = 34
NIVEL_UMBRAL_MEDIO_ALTO = 67

# Una solicitud real de permiso puede ser un polígono muy chico (ej. ~20m
# para reparar un poste). Con el filtro espacial estricto (within/
# intersects) eso casi nunca encuentra incidentes ni manzanas censales,
# aunque esté en plena zona de riesgo, porque el área es demasiado chica
# para la resolución del dataset (594 incidentes en ~11x9 km). Por eso,
# si el polígono recibido es más chico que AREA_MINIMA_M2, se expande con
# un buffer de BUFFER_MINIMO_M metros antes de filtrar — tanto para el
# riesgo como para la congestión, así ambos números reflejan la misma
# zona efectiva.
AREA_MINIMA_M2 = 150 * 150
BUFFER_MINIMO_M = 75


def _distancia_circular_dias(fecha_a: date, fecha_b: date) -> int:
    """Distancia en días entre dos fechas ignorando el año (circular sobre
    365 días), para capturar patrones estacionales ("misma época del año")
    en vez de exigir coincidencia exacta de año con el dataset histórico."""
    dia_anio_a = fecha_a.timetuple().tm_yday
    dia_anio_b = fecha_b.timetuple().tm_yday
    diff_days = abs(dia_anio_a - dia_anio_b)
    return min(diff_days, 365 - diff_days)


def _area_aproximada_m2(poligono: BaseGeometry) -> float:
    """Aproxima el área del polígono en m², asumiendo que la conversión
    grados->metros es ~constante en su extensión — válido para polígonos
    del tamaño de una solicitud de permiso, no para polígonos que abarquen
    toda la comuna."""
    return poligono.area * METROS_POR_GRADO_LAT * METROS_POR_GRADO_LON


def _aplicar_buffer_minimo(poligono: BaseGeometry) -> tuple[BaseGeometry, float]:
    """Expande el polígono con BUFFER_MINIMO_M si es más chico que
    AREA_MINIMA_M2. Devuelve (polígono efectivo, buffer aplicado en metros
    — 0.0 si no se aplicó ninguno)."""
    if _area_aproximada_m2(poligono) >= AREA_MINIMA_M2:
        return poligono, 0.0

    buffer_grados_lat = BUFFER_MINIMO_M / METROS_POR_GRADO_LAT
    buffer_grados_lon = BUFFER_MINIMO_M / METROS_POR_GRADO_LON
    buffer_grados = (buffer_grados_lat + buffer_grados_lon) / 2
    return poligono.buffer(buffer_grados), float(BUFFER_MINIMO_M)


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
    poligono, buffer_aplicado_m = _aplicar_buffer_minimo(poligono)

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
        "buffer_aplicado_m": buffer_aplicado_m,
    }
