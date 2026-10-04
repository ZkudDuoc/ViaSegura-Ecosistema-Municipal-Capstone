import logging
from contextlib import asynccontextmanager

from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
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
from app.services.calles_riesgo import (
    a_feature_collection,
    construir_calles,
    evaluar_score_con_datos_reales,
    preparar_calles,
)
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
    app.state.calles = preparar_calles(
        cargar_calles(config.CALLES_DATASET_PATH), app.state.incidents_gdf
    )

    app.state.zonas_rojas = calcular_zonas_rojas(
        app.state.incidents_gdf, app.state.census
    )
    # Caché por hora: None = flujo SECTRA sin modular. Las demás horas se
    # arman la primera vez que se piden (ver /calles-riesgo).
    app.state.calles_cache = {None: construir_calles(app.state.calles)}
    app.state.calles_origen = (
        sorted(app.state.calles["origen_dato"].unique().tolist()) if len(app.state.calles) else []
    )
    app.state.calles_cobertura = _cobertura_calles(app.state.calles)
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


def _cobertura_calles(calles) -> dict:
    """Qué tan completo vino el cruce calle-comuna de SECTRA (se expone en
    /health para detectar datos incompletos sin abrir el archivo)."""
    if len(calles) == 0:
        return {"tramos_con_comuna": 0, "tramos_sin_comuna": 0, "tramos_sin_nombre": 0, "comunas": 0, "tramos_santiago": 0}
    con_comuna = calles["comuna"].fillna("").astype(str).str.strip() != ""
    sin_nombre = calles["nombre"].fillna("").astype(str).str.strip() == ""
    return {
        "tramos_con_comuna": int(con_comuna.sum()),
        "tramos_sin_comuna": int((~con_comuna).sum()),
        "tramos_sin_nombre": int(sin_nombre.sum()),
        "comunas": int(calles.loc[con_comuna, "comuna"].nunique()),
        "tramos_santiago": int((calles["comuna"] == config.COMUNA_PRINCIPAL).sum()),
    }


app = FastAPI(
    title="ViaSegura",
    lifespan=lifespan,
)
# El GeoJSON de /calles-riesgo para Santiago pesa ~1 MB; comprimido baja a
# una fracción, así que el mapa carga rápido incluso en el plan gratuito.
app.add_middleware(GZipMiddleware, minimum_size=1000)


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
        # Cobertura del cruce calle-comuna (SECTRA): tramos sin comuna o sin
        # nombre indican datos incompletos.
        "cobertura_calles": app.state.calles_cobertura,
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
        hora_congestion=payload.hora_inicio,
        hora_inicio=payload.hora_inicio if payload.hora_inicio is not None else 12,
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


def _parsear_bbox(bbox: str) -> tuple[float, float, float, float]:
    try:
        min_lon, min_lat, max_lon, max_lat = (float(v) for v in bbox.split(","))
    except ValueError:
        raise HTTPException(status_code=422, detail="bbox debe ser minLon,minLat,maxLon,maxLat (4 números separados por coma)")
    if min_lon >= max_lon or min_lat >= max_lat:
        raise HTTPException(status_code=422, detail="bbox inválido: el mínimo debe ser menor que el máximo")
    return min_lon, min_lat, max_lon, max_lat


@app.get(
    "/calles-riesgo",
    response_model=None,
    summary="Riesgo y congestión por calle (JSON o GeoJSON listo para el mapa)",
)
def calles_riesgo(
    request: Request,
    comuna: str | None = Query(default=None, description="Filtra por comuna (ej. SANTIAGO)."),
    metrica: Literal["riesgo", "congestion"] = Query(
        default="riesgo", description="Qué métrica define el `color` en formato=geojson."
    ),
    hora: int | None = Query(
        default=None, ge=0, le=23,
        description="Hora del día (0-23): modula la congestión con un perfil horario (estimación).",
    ),
    bbox: str | None = Query(
        default=None, description="minLon,minLat,maxLon,maxLat: solo calles que toquen esa caja."
    ),
    formato: Literal["json", "geojson"] = Query(
        default="json",
        description="`json` mantiene la respuesta original; `geojson` entrega una FeatureCollection con `color` por calle.",
    ),
):
    cache = request.app.state.calles_cache
    if hora not in cache:
        cache[hora] = construir_calles(request.app.state.calles, hora)
    calles = cache[hora]

    if comuna:
        calles = [c for c in calles if (c["comuna"] or "").upper() == comuna.upper()]
    if bbox:
        min_lon, min_lat, max_lon, max_lat = _parsear_bbox(bbox)
        calles = [
            c for c in calles
            if not (c["_limites"][2] < min_lon or c["_limites"][0] > max_lon
                    or c["_limites"][3] < min_lat or c["_limites"][1] > max_lat)
        ]

    if formato == "geojson":
        return a_feature_collection(calles, metrica, comuna.upper() if comuna else None, hora)

    return CallesRiesgoResponse(
        total_calles=len(calles),
        fuente_datos=(
            "Calles y congestión: SECTRA (Observatorio de Ciudades UC), CC BY-NC 4.0. "
            "Factor de criminalidad real por comuna: CEAD (cead.minsegpublica.gob.cl), "
            "captura manual 2025. Riesgo por calle: total CEAD repartido por flujo "
            "y largo del tramo (estimación)."
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
