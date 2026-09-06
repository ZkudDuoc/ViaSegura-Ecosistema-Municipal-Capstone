# ViaSegura

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

### ⚠️ Pendiente de calibración: polígonos chicos de solicitudes reales

`POST /score` filtra incidentes con `within(poligono)` (estrictamente
dentro) y manzanas censales con `intersects(poligono)` (que lo toquen) —
sin ningún buffer extra. Esto funciona bien con los polígonos grandes
usados en las pruebas (~1-2 km de lado), pero una solicitud real de
permiso puede ser mucho más chica: ej. un cuadrado de ~20m para reparar
un poste.

Probado con un polígono de 20m ubicado en el centro exacto de una zona
que con un polígono de ~2 km da `risk_score: 98.17` (nivel alto):

```
poligono 20m -> {"risk_score": 0.0, "congestion_score": 0.0, "nivel": "bajo", "n_incidentes_considerados": 0}
```

El polígono chico no toca ningún incidente ni ninguna manzana censal
completa, aunque esté en plena zona de alto riesgo — el score da 0 por
falta de resolución espacial, no porque la zona sea segura.

**Opciones a evaluar en la calibración de Semana 3:**
- Aplicar un buffer mínimo (ej. 50-100m) alrededor del polígono recibido
  antes de filtrar incidentes/manzanas, para solicitudes puntuales.
- Reemplazar el filtro estricto por distancia al incidente/manzana más
  cercano cuando el polígono sea menor a un área mínima.
- Definir con Joshua/Agustin qué tan chico puede llegar a ser un
  polígono real desde la app, para dimensionar el buffer correctamente.

Rama de trabajo: `nicolas-riesgo`.
