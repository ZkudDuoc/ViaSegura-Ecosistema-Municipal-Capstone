import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import config
from app.data.census import generate_simulated_census, load_census
from app.data.incidents import generate_simulated_incidents, load_incidents

logger = logging.getLogger("servicio-riesgo")


@asynccontextmanager
async def lifespan(app: FastAPI):
    generate_simulated_incidents(config.INCIDENTS_DATASET_PATH)
    generate_simulated_census(config.INE_CENSUS_DATA_PATH)

    app.state.incidents = load_incidents(config.INCIDENTS_DATASET_PATH)
    app.state.census = load_census(config.INE_CENSUS_DATA_PATH)

    logger.info(
        "Datasets cargados: %d incidentes, %d manzanas censales",
        len(app.state.incidents),
        len(app.state.census),
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
