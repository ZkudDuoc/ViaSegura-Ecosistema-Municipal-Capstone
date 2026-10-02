"""Asignación inteligente de inspecciones (Semana 5, Anexo B, prioridad P2).

Recibe las obras activas del Backend y devuelve el orden en que el
Supervisor debería visitarlas: primero las que tienen una emergencia
activa (ej. botón de pánico), después por una combinación de riesgo y
congestión. No persiste nada — es solo una función de orden sobre datos
que el Backend ya tiene; si el Backend necesita guardar o repetir el
ranking, lo vuelve a pedir.

Usa datos REALES cuando puede: si la obra cae cerca de una calle de
SECTRA (misma búsqueda que /calles-riesgo), la congestión viene del
flujo vehicular real y el riesgo se escala por el factor de
criminalidad real de esa comuna (CEAD). Si no hay ninguna calle real
cerca, cae al proxy de /score (densidad poblacional simulada) — mismo
respaldo que usa todo el proyecto cuando falta un dato real.
"""

from datetime import date

import geopandas as gpd
from shapely.errors import GEOSException
from shapely.geometry import shape

from app.services.calles_riesgo import evaluar_score_con_datos_reales

PESO_RIESGO = 0.6
PESO_CONGESTION = 0.4


def _motivo(risk_score: float, congestion_score: float, emergencia_activa: bool, con_datos_reales: bool) -> str:
    if emergencia_activa:
        return "Emergencia activa reportada en la obra (prioridad máxima)."
    calidad = "con datos reales de calle" if con_datos_reales else "con datos estimados"
    if risk_score >= 67:
        return f"Riesgo alto ({risk_score}), {calidad}."
    if congestion_score >= 67:
        return f"Congestión alta ({congestion_score}) en una zona de riesgo medio/bajo, {calidad}."
    return f"Riesgo {risk_score} y congestión {congestion_score} ({calidad}), sin urgencia detectada."


def calcular_ranking_inspecciones(
    gdf_incidentes: gpd.GeoDataFrame,
    gdf_censo: gpd.GeoDataFrame,
    gdf_calles: gpd.GeoDataFrame,
    obras: list,
) -> list[dict]:
    resultado = []
    for obra in obras:
        try:
            poligono = shape(obra.poligono.model_dump())
            if not poligono.is_valid:
                raise GEOSException("geometría no válida")
        except (GEOSException, ValueError):
            resultado.append(
                {
                    "id": obra.id,
                    "risk_score": 0.0,
                    "congestion_score": 0.0,
                    "nivel": "bajo",
                    "emergencia_activa": obra.emergencia_activa,
                    "prioridad_score": 0.0,
                    "comuna_detectada": None,
                    "fuente_congestion": "ninguna (polígono inválido)",
                    "motivo": "Polígono inválido recibido para esta obra; no se pudo evaluar.",
                }
            )
            continue

        r = evaluar_score_con_datos_reales(gdf_incidentes, gdf_censo, gdf_calles, poligono, obra.fecha)
        con_datos_reales = r["fuente_congestion"].startswith("real")

        prioridad = PESO_RIESGO * r["risk_score"] + PESO_CONGESTION * r["congestion_score"]
        resultado.append(
            {
                "id": obra.id,
                "risk_score": r["risk_score"],
                "congestion_score": r["congestion_score"],
                "nivel": r["nivel"],
                "emergencia_activa": obra.emergencia_activa,
                "prioridad_score": round(prioridad, 2),
                "comuna_detectada": r["comuna_detectada"],
                "fuente_congestion": r["fuente_congestion"],
                "motivo": _motivo(
                    r["risk_score"], r["congestion_score"], obra.emergencia_activa, con_datos_reales
                ),
            }
        )

    # Emergencias siempre primero (sort estable: False < True, por eso "not").
    resultado.sort(key=lambda o: (not o["emergencia_activa"], -o["prioridad_score"]))
    return resultado
