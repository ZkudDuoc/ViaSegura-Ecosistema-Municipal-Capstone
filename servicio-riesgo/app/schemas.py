from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class GeoJSONPolygon(BaseModel):
    """Polígono GeoJSON en EPSG:4326, mismo formato que envía la app móvil
    (Módulo 1) al Backend (Módulo 2), que lo reenvía tal cual a este
    endpoint."""

    type: Literal["Polygon"]
    coordinates: list[list[list[float]]]


class ScoreRequest(BaseModel):
    poligono: GeoJSONPolygon
    fecha: date = Field(description="Fecha de la actividad solicitada")
    tipo_actividad: Literal["PROGRAMADA", "EMERGENCIA"] = Field(
        description=(
            "Mismo enum tipo_actividad del esquema del Backend (Módulo 2). "
            "No pondera el score: el tipo de permiso no cambia el riesgo "
            "físico real de la zona (ver services/scoring.py); se recibe y "
            "se refleja en la respuesta solo para trazabilidad."
        )
    )


class ScoreResponse(BaseModel):
    risk_score: float = Field(ge=0, le=100)
    congestion_score: float = Field(ge=0, le=100)
    nivel: Literal["bajo", "medio", "alto"]
    n_incidentes_considerados: int
    buffer_aplicado_m: float = Field(
        description="Buffer en metros aplicado al polígono recibido si era "
        "más chico que el área mínima de resolución del dataset (0 si no "
        "se aplicó ninguno)."
    )
    tipo_actividad: str


class ZonaRoja(BaseModel):
    cluster_id: int
    n_incidentes: int
    densidad_poblacional_normalizada_promedio: float
    indice_riesgo_normalizado: float
    es_zona_roja: bool
    centroide: dict[str, float]
    contorno_geojson: dict


class ZonasRojasResponse(BaseModel):
    total_clusters: int
    parametros: dict
    zonas: list[ZonaRoja]
