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
    hora_inicio: int = Field(
        default=12,
        ge=0,
        le=23,
        description=(
            "Hora (0-23) en que comienza la ventana del permiso. Si cae en "
            "horario nocturno (ver NOCHE_HORA_INICIO/NOCHE_HORA_FIN), el "
            "riesgo se pondera más alto. Por defecto 12 (mediodía, sin "
            "ponderación) para no romper al Backend mientras no mande la "
            "hora real — ver README, sección Semana 5."
        ),
    )


class IncidenteConsiderado(BaseModel):
    """Un incidente real que contribuyó al risk_score — para que el detalle
    del dashboard le muestre al operador, en texto simple, por qué salió
    ese número."""

    tipo_incidente: str
    gravedad: str
    fecha: date


class Explicacion(BaseModel):
    resumen: str = Field(description="Texto simple para un operador no técnico.")
    incidentes_considerados: list[IncidenteConsiderado]
    franja_horaria: Literal["dia", "noche"]
    peso_nocturno_aplicado: bool


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
    explicacion: Explicacion
    comuna_detectada: str | None = Field(
        description="Comuna real (SECTRA) más cercana a la solicitud, si se "
        "encontró alguna calle real cerca (mismo criterio que /ranking-inspecciones)."
    )
    fuente_congestion: str = Field(
        description="Si congestion_score vino de calles reales (SECTRA) o del proxy de densidad poblacional."
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


class CalleRiesgo(BaseModel):
    """Riesgo y congestión de un tramo de calle real (dataset SECTRA),
    para pintar el mapa del dashboard — ver app/services/calles_riesgo.py."""

    calle_id: int
    nombre: str
    comuna: str | None
    risk_score: float = Field(ge=0, le=100)
    nivel: Literal["bajo", "medio", "alto"]
    congestion_score: float = Field(ge=0, le=100)
    flujo_vehicular_hora: float | None = Field(
        description="Flujo vehicular por hora medido (dato real de SECTRA), null si no estaba disponible para ese tramo."
    )
    n_incidentes: int
    factor_criminalidad_real: float = Field(
        description="Factor real de criminalidad de la comuna de esta calle "
        "(CEAD, 1.0 = promedio nacional; ver app/data/criminalidad_real.py). "
        "Ya está aplicado al risk_score, se expone para trazabilidad."
    )
    geometry_geojson: dict


class CallesRiesgoResponse(BaseModel):
    total_calles: int
    fuente_datos: str
    calles: list[CalleRiesgo]


class ObraActiva(BaseModel):
    """Una obra/permiso activo que el Backend quiere priorizar para
    inspección. id/poligono/fecha vienen del permiso; emergencia_activa la
    pone el Backend si hay una alerta de pánico asociada (ver 002_logica.sql)."""

    id: str
    poligono: GeoJSONPolygon
    fecha: date
    tipo_actividad: Literal["PROGRAMADA", "EMERGENCIA"] = "PROGRAMADA"
    emergencia_activa: bool = False


class RankingInspeccionesRequest(BaseModel):
    obras: list[ObraActiva]


class ObraRankeada(BaseModel):
    id: str
    risk_score: float
    congestion_score: float
    nivel: Literal["bajo", "medio", "alto"]
    emergencia_activa: bool
    prioridad_score: float = Field(
        description="Score combinado usado para ordenar (no es risk_score ni congestion_score solos)."
    )
    comuna_detectada: str | None = Field(
        description="Comuna real (SECTRA) más cercana a la obra, si se encontró alguna calle real cerca."
    )
    fuente_congestion: str = Field(
        description="Si congestion_score vino de calles reales (SECTRA) o del proxy de densidad poblacional."
    )
    motivo: str


class RankingInspeccionesResponse(BaseModel):
    total: int
    ranking: list[ObraRankeada]
