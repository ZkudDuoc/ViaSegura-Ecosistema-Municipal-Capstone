import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from shapely.geometry import shape
from shapely.errors import GEOSException

from app import config
from app.data.census import generate_simulated_census, load_census
from app.data.incidents import (
    as_geodataframe,
    generate_simulated_incidents,
    load_incidents,
)
from app.schemas import ScoreRequest, ScoreResponse, ZonasRojasResponse
from app.services.clustering import EPS_KM, MIN_SAMPLES, calcular_zonas_rojas
from app.services.scoring import calcular_score

logger = logging.getLogger("servicio-riesgo")


@asynccontextmanager
async def lifespan(app: FastAPI):
    generate_simulated_incidents(config.INCIDENTS_DATASET_PATH)
    generate_simulated_census(config.INE_CENSUS_DATA_PATH)

    app.state.incidents = load_incidents(config.INCIDENTS_DATASET_PATH)
    app.state.census = load_census(config.INE_CENSUS_DATA_PATH)
    app.state.incidents_gdf = as_geodataframe(app.state.incidents)

    app.state.zonas_rojas = calcular_zonas_rojas(
        app.state.incidents_gdf, app.state.census
    )

    logger.info(
        "Datasets cargados: %d incidentes, %d manzanas censales, %d zonas rojas",
        len(app.state.incidents),
        len(app.state.census),
        len(app.state.zonas_rojas),
    )
    yield


app = FastAPI(
    title="VíaSegura — Microservicio de Inteligencia Geoespacial",
    lifespan=lifespan,
)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "module": "servicio-riesgo",
        "datasets": {
            "incidentes": len(app.state.incidents),
            "manzanas_censales": len(app.state.census),
        },
    }


@app.post("/score", response_model=ScoreResponse)
def score(payload: ScoreRequest, request: Request):
    try:
        poligono = shape(payload.poligono.model_dump())
    except (GEOSException, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Polígono inválido: {exc}")

    if not poligono.is_valid:
        raise HTTPException(status_code=400, detail="Polígono inválido (geometría no válida)")

    resultado = calcular_score(
        incidents_gdf=request.app.state.incidents_gdf,
        census_gdf=request.app.state.census,
        poligono=poligono,
        fecha=payload.fecha,
    )
    return ScoreResponse(**resultado, tipo_actividad=payload.tipo_actividad)


@app.get("/zonas-rojas", response_model=ZonasRojasResponse)
def zonas_rojas(request: Request):
    zonas = request.app.state.zonas_rojas
    return ZonasRojasResponse(
        total_clusters=len(zonas),
        parametros={"eps_km": EPS_KM, "min_samples": MIN_SAMPLES},
        zonas=zonas,
    )
