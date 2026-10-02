import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Request
from shapely.geometry import shape
from shapely.errors import GEOSException

from app import config
from app.data.calles import cargar_calles, generar_calles
from app.data.censo import cargar_censo, generar_censo_simulado
from app.data.incidents import (
    as_geodataframe,
    cargar_incidentes,
    generar_incidentes_simulados,
)
from app.schemas import (
    CallesRiesgoResponse,
    RankingInspeccionesRequest,
    RankingInspeccionesResponse,
    ScoreRequest,
    ScoreResponse,
    ZonasRojasResponse,
)
from app.services.calles_riesgo import calcular_riesgo_calles, evaluar_score_con_datos_reales
from app.services.clustering import EPS_KM, MIN_SAMPLES, calcular_zonas_rojas
from app.services.ranking import calcular_ranking_inspecciones

logger = logging.getLogger("servicio-riesgo")


@asynccontextmanager
async def lifespan(app: FastAPI):
    generar_incidentes_simulados(config.INCIDENTS_DATASET_PATH)
    generar_censo_simulado(config.INE_CENSUS_DATA_PATH)
    generar_calles(config.CALLES_DATASET_PATH)

    app.state.incidents = cargar_incidentes(config.INCIDENTS_DATASET_PATH)
    app.state.census = cargar_censo(config.INE_CENSUS_DATA_PATH)
    app.state.incidents_gdf = as_geodataframe(app.state.incidents)
    app.state.calles = cargar_calles(config.CALLES_DATASET_PATH)

    app.state.zonas_rojas = calcular_zonas_rojas(
        app.state.incidents_gdf, app.state.census
    )
    app.state.calles_riesgo = calcular_riesgo_calles(
        app.state.incidents_gdf, app.state.calles
    )
    app.state.calles_origen = (
        sorted(app.state.calles["origen_dato"].unique().tolist()) if len(app.state.calles) else []
    )
    fuentes_calles = app.state.calles_origen

    logger.info(
        "Datasets cargados: %d incidentes, %d manzanas censales, %d zonas rojas, "
        "%d tramos de calle (fuente: %s)",
        len(app.state.incidents),
        len(app.state.census),
        len(app.state.zonas_rojas),
        len(app.state.calles),
        fuentes_calles,
    )
    yield


app = FastAPI(
    title="ViaSegura",
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
            "tramos_calle": len(app.state.calles),
            # ["sectra_real"] = SECTRA respondió al arrancar; ["simulado_respaldo"]
            # = SECTRA no respondió y se usó la red de calles simulada (ver
            # app/data/calles.py) — si aparece esto en producción, /calles-riesgo
            # y el factor de criminalidad real siguen funcionando, pero con una
            # red de calles mucho más chica y sin comunas reales.
            "tramos_calle_origen": app.state.calles_origen,
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

    # Mismo criterio que /ranking-inspecciones (Semana 5): si la solicitud
    # cae cerca de una calle real de SECTRA, se usa su congestión real y el
    # factor de criminalidad real de esa comuna (CEAD) en vez del proxy de
    # densidad poblacional — antes esto solo pasaba en /ranking-inspecciones
    # y /calles-riesgo, así que la misma obra podía dar un risk_score
    # distinto según qué endpoint se consultara.
    resultado = evaluar_score_con_datos_reales(
        request.app.state.incidents_gdf,
        request.app.state.census,
        request.app.state.calles,
        poligono,
        payload.fecha,
        hora_inicio=payload.hora_inicio,
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


@app.get("/calles-riesgo", response_model=CallesRiesgoResponse)
def calles_riesgo(request: Request, comuna: str | None = Query(default=None)):
    calles = request.app.state.calles_riesgo
    if comuna:
        calles = [c for c in calles if (c["comuna"] or "").upper() == comuna.upper()]
    return CallesRiesgoResponse(
        total_calles=len(calles),
        fuente_datos=(
            "Calles y congestión: SECTRA (Observatorio de Ciudades UC), CC BY-NC 4.0. "
            "Factor de criminalidad real por comuna: CEAD (cead.minsegpublica.gob.cl), "
            "captura manual 2025."
        ),
        calles=calles,
    )


@app.post("/ranking-inspecciones", response_model=RankingInspeccionesResponse)
def ranking_inspecciones(payload: RankingInspeccionesRequest, request: Request):
    ranking = calcular_ranking_inspecciones(
        request.app.state.incidents_gdf,
        request.app.state.census,
        request.app.state.calles,
        payload.obras,
    )
    return RankingInspeccionesResponse(total=len(ranking), ranking=ranking)
