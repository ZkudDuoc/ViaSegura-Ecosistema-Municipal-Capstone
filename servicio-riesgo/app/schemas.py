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
    tipo_actividad: str = Field(
        description=(
            "Tipo de actividad de la solicitud de permiso. No se usa aún "
            "para ponderar el score (pendiente de calibración en Semana 3); "
            "se recibe y se refleja en la respuesta para trazabilidad."
        )
    )


class ScoreResponse(BaseModel):
    risk_score: float = Field(ge=0, le=100)
    congestion_score: float = Field(ge=0, le=100)
    nivel: Literal["bajo", "medio", "alto"]
    n_incidentes_considerados: int
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
