"""Score de riesgo espacio-temporal (Semana 2, calibrado en Semanas 3 y 4).

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
from shapely.affinity import scale
from shapely.geometry.base import BaseGeometry

from app import config
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

# Margen de búsqueda alrededor del polígono recibido (Semana 4). Desde que
# el frontend calcula el polígono solo (ruta del camión + ~5.5 m a cada
# lado, ver Anexo A del plan), llegan polígonos angostos: 11 m de ancho por
# el largo del tramo. Con el filtro estricto (within/intersects) casi nunca
# tocan un incidente, aunque la cuadra sea peligrosa — el dataset tiene
# ~6 incidentes por km². Por eso el polígono se expande BUFFER_BUSQUEDA_M
# metros antes de filtrar, tanto para riesgo como para congestión (ambos
# números reflejan la misma zona efectiva). Semana 3 lo aplicaba solo a
# polígonos de menos de 150x150 m; ese umbral por área era un error: una
# ruta de 2.5 km (27 500 m²) quedaba sin margen y daba MENOS riesgo que la
# misma ruta recortada a 2 km (ver scripts/probar_poligonos_ruta.py). Un
# margen uniforme es monótono: si A contiene a B, buffer(A) contiene a
# buffer(B), así que una ruta más larga nunca baja el riesgo.
# Configurable sin tocar código: variable de entorno BUFFER_BUSQUEDA_M.
BUFFER_BUSQUEDA_M = config.BUFFER_BUSQUEDA_M


def _distancia_circular_dias(fecha_a: date, fecha_b: date) -> int:
    """Distancia en días entre dos fechas ignorando el año (circular sobre
    365 días), para capturar patrones estacionales ("misma época del año")
    en vez de exigir coincidencia exacta de año con el dataset histórico."""
    dia_anio_a = fecha_a.timetuple().tm_yday
    dia_anio_b = fecha_b.timetuple().tm_yday
    diff_days = abs(dia_anio_a - dia_anio_b)
    return min(diff_days, 365 - diff_days)


def _expandir_poligono(poligono: BaseGeometry, buffer_m: float) -> BaseGeometry:
    """Expande el polígono `buffer_m` metros REALES en todas las direcciones.
    Un grado de longitud mide menos que uno de latitud (~92.8 km vs ~111.3
    km a esta latitud), así que se pasa a metros, se aplica el buffer y se
    vuelve a grados; buffear directo en grados dejaría el margen ~17% más
    corto en dirección este-oeste."""
    if buffer_m <= 0:
        return poligono
    en_metros = scale(
        poligono, METROS_POR_GRADO_LON, METROS_POR_GRADO_LAT, origin=(0, 0)
    )
    return scale(
        en_metros.buffer(buffer_m),
        1 / METROS_POR_GRADO_LON,
        1 / METROS_POR_GRADO_LAT,
        origin=(0, 0),
    )


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
    buffer_m: float | None = None,
) -> dict:
    buffer_aplicado_m = float(BUFFER_BUSQUEDA_M if buffer_m is None else buffer_m)
    poligono = _expandir_poligono(poligono, buffer_aplicado_m)

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
