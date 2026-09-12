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
    "tipo_actividad": "PROGRAMADA"
  }'
```

```json
{"risk_score":99.75,"congestion_score":4.04,"nivel":"alto","n_incidentes_considerados":10,"buffer_aplicado_m":0.0,"tipo_actividad":"PROGRAMADA"}
```

`tipo_actividad` acepta exactamente los dos valores del enum real del
Backend: `"PROGRAMADA"` o `"EMERGENCIA"`.

### Ejemplo — `GET /zonas-rojas`

```bash
curl http://localhost:8000/zonas-rojas
```

Devuelve `{ total_clusters, parametros: { eps_km, min_samples }, zonas: [...] }`,
donde cada zona trae `centroide`, `contorno_geojson` (para pintarla en el
mapa) e `indice_riesgo_normalizado` (conteo de incidentes del cluster ya
dividido por su densidad poblacional normalizada).

## Semana 3 — Calibración (Feature Freeze)

Sin endpoints nuevos: solo se ajustan parámetros y se corrigen los
problemas encontrados en Semana 2, con evidencia en vez de "a ojo" (ver
`scripts/calibrar_parametros.py`, que corre ~1500 solicitudes simuladas
de tamaño realista sobre el dataset real).

**1. Buffer mínimo para polígonos chicos.** Una solicitud real (ej. ~20m
para reparar un poste) casi nunca tocaba ningún incidente ni manzana
censal con el filtro estricto de Semana 2, aunque estuviera en plena zona
de riesgo (`risk_score: 0.0` en un punto que con un polígono de ~2km daba
`98.17`). Ahora, si el polígono recibido es más chico que
`AREA_MINIMA_M2` (150×150m), `scoring.py` lo expande con
`BUFFER_MINIMO_M` (75m) antes de filtrar — tanto para riesgo como para
congestión. La respuesta de `/score` ahora informa `buffer_aplicado_m`
(0 si no se aplicó ninguno) para que quede trazable.

**2. Recalibración de constantes**, corriendo 1500 solicitudes de 15-300m
de lado sobre el dataset real:

| Parámetro | Semana 2 | Semana 3 | Por qué |
|---|---|---|---|
| `RISK_TAU` (scoring.py) | 6.0 | **2.5** | Con 6.0, el nivel "alto" era prácticamente inalcanzable para una solicitud de tamaño real (0 casos en 1500 simuladas) — la suma ponderada de incidentes cercanos a un polígono chico casi siempre cae entre 1 y 5. Con 2.5: 1 incidente leve ≈ bajo, 2 ≈ medio, 3+ (o un solo incidente "alta") ≈ alto. |
| `EPS_KM` (clustering.py) | 0.35 | **0.5** | Con 0.35 solo se agrupaba el 32% de los incidentes (193/594), dejando la mayoría como "ruido" sin cluster. Con 0.5 se agrupa el 86% (513/594) en 27 clusters de tamaño razonable, sin colapsar en uno solo (eso pasa recién en 0.75). |
| `VENTANA_DIAS` | 45 | 45 (sin cambio) | Probado contra 15/30/60/90 días; 45 da una proporción razonable de solicitudes con algún incidente cercano (7%) sin diluir demasiado el patrón estacional. |
| `NIVEL_UMBRAL_BAJO_MEDIO` / `MEDIO_ALTO` | 34 / 67 | 34 / 67 (sin cambio) | Ya funcionan bien combinados con el nuevo `RISK_TAU`. |
| `MIN_SAMPLES` (clustering.py) | 5 | 5 (sin cambio) | — |

Escenarios de prueba explícitos por nivel en `tests/test_escenarios.py`
(1 incidente → bajo, 2 → medio, 3 → alto).

**3. `tipo_actividad`: se valida, no se pondera.** El campo ahora se
valida contra el enum real del Backend (`PROGRAMADA` / `EMERGENCIA`, no
texto libre) — pero **no se usa para ponderar el score a propósito**: no
existe ninguna razón física para que el tipo de permiso cambie el riesgo
real de la zona (el riesgo de la calle no depende de si el permiso se
pidió con anticipación o es una emergencia), y no hay datos que
respalden una correlación tipo-de-actividad ↔ tipo-de-incidente.
Inventar un multiplicador ahí habría sido una regla de negocio ficticia.
El campo ya se usa correctamente aguas abajo, en el Backend, para
priorizar la cola de permisos (`ORDER BY tipo_actividad = 'EMERGENCIA'
DESC` en `002_logica.sql`).

Rama de trabajo: `nicolas-riesgo`.
