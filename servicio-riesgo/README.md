# servicio-riesgo — Microservicio de Inteligencia Geoespacial (Módulo 3)

Responsable: Nicolas Saavedra

## Alcance (ver plan completo en `../docs/ViaSegura-Plan-Proyecto.md`)
Python + FastAPI: score de riesgo espacio-temporal, clustering DBSCAN/K-Means para zonas rojas normalizadas por densidad poblacional (dataset simulado + datos censales del INE).

## Setup

```bash
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
cp .env.example .env           # completar rutas de datasets
uvicorn app.main:app --reload
```

Verificar que el servicio responde en `http://localhost:8000/health`.

Para correr los tests (instala también `pytest`/`httpx`):

```bash
pip install -r requirements-dev.txt
pytest -v
```

## Semana 1 — Tareas
- Carga y limpieza del dataset simulado de incidentes delictivos.
- Carga de datos censales del INE por manzana censal.
- Endpoint `/health`.

## Semana 2 — Tareas
- `POST /score`: recibe polígono GeoJSON + fecha + tipo de actividad, cruza
  la zona/ventana de tiempo contra los incidentes históricos y contra la
  densidad poblacional de las manzanas censales que intersecta. Responde
  en tiempo real (sin batch) porque opera directamente sobre los datasets
  ya cargados en memoria en `app.state`.
- `GET /zonas-rojas`: clusters DBSCAN de incidentes (normalizados por
  densidad poblacional para no confundir "mucha gente" con "zona
  peligrosa"), precalculados una vez al levantar el servicio.

### Ejemplo — `POST /score`

```bash
curl -X POST http://localhost:8000/score \
  -H "Content-Type: application/json" \
  -d '{
    "poligono": {
      "type": "Polygon",
      "coordinates": [[[-70.665, -33.465], [-70.650, -33.465], [-70.650, -33.450], [-70.665, -33.450], [-70.665, -33.465]]]
    },
    "fecha": "2025-05-15",
    "tipo_actividad": "carga_general"
  }'
```

```json
{"risk_score":91.79,"congestion_score":4.04,"nivel":"alto","n_incidentes_considerados":10,"tipo_actividad":"carga_general"}
```

### Ejemplo — `GET /zonas-rojas`

```bash
curl http://localhost:8000/zonas-rojas
```

Devuelve `{ total_clusters, parametros: { eps_km, min_samples }, zonas: [...] }`,
donde cada zona trae `centroide`, `contorno_geojson` (para pintarla en el
mapa) e `indice_riesgo_normalizado` (conteo de incidentes del cluster ya
dividido por su densidad poblacional normalizada).

> Nota de calibración: la ventana temporal (`VENTANA_DIAS`), el `RISK_TAU`
> del score, los umbrales de nivel y los parámetros de DBSCAN (`EPS_KM`,
> `MIN_SAMPLES`) son valores de partida razonables — el plan reserva su
> ajuste fino para la calibración de Semana 3.

Rama de trabajo: `nicolas-riesgo`.
