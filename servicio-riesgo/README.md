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
{"risk_score":90.93,"congestion_score":6.53,"nivel":"alto","n_incidentes_considerados":3,"buffer_aplicado_m":75.0,"tipo_actividad":"PROGRAMADA"}
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
censal con el filtro estricto de Semana 2 (`risk_score: 0.0` en un punto
que con un polígono de ~2km daba `98.17`). Semana 3 lo resolvió expandiendo
solo los polígonos de menos de 150×150 m. **Ese criterio por área tenía un
error y se reemplazó en la Semana 4** (ver más abajo).

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
(bajo, medio, alto y sin riesgo; en Semana 4 pasaron a rutas de 150 m
centradas en incidentes reales del dataset).

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

## Semana 4 — Polígono auto-calculado, E2E y despliegue

Cambio de alcance del equipo (Anexo A del plan): el polígono ya no lo
dibuja el chofer; el frontend lo calcula al presionar "iniciar trabajo"
(GPS del camión + ancho ~2.5 m + conos 3 m ≈ **5.5 m por lado**). El
contrato de `/score` no cambia (mismo GeoJSON de entrada, mismos campos de
salida), pero los polígonos ahora son **angostos (~11 m de ancho)**.
`tests/poligonos_ruta.py` reproduce esa forma para probar sin esperar al
frontend.

**1. Bug encontrado y corregido: el buffer por área no era monótono.**
`scripts/probar_poligonos_ruta.py` mostró que con el criterio de Semana 3
(buffer solo si el área < 150×150 m) una ruta de 2 500 m (27 500 m²)
quedaba **sin margen** y encontraba incidentes en el 7% de los casos,
mientras que la de 2 000 m (con margen) llegaba al 52%. En 685 de 1 500
pares, una ruta que *contenía* a otra dio **menos riesgo** (imposible).
Ahora el margen es **uniforme**, en metros reales en ambos ejes
(`BUFFER_BUSQUEDA_M`, 75 m por defecto, variable de entorno) y aplica a
toda solicitud: si A contiene a B, buffer(A) contiene a buffer(B), así que
una ruta más larga nunca baja el riesgo (0 violaciones en 1 500 pares,
y hay un test que lo verifica). `buffer_aplicado_m` en la respuesta
informa el margen usado.

| Buffer | 0 m | 25 m | 50 m | **75 m** | 100 m | 150 m |
|---|---|---|---|---|---|---|
| Solicitudes que tocan algún incidente (de 1 500 rutas simuladas) | 6 (0.4%) | 41 | 83 | **132 (8.8%)** | 197 | 298 |

Sin margen el módulo era casi ciego para polígonos angostos; 75 m equivale
a media cuadra de zona de influencia. Es una decisión de política:
subirlo aumenta la sensibilidad y reduce la precisión.

**2. Cobertura anual del dataset simulado.** Las fechas terminaban en agosto:
para solicitudes de octubre-noviembre (la época de la demo) el 0.0% de las
rutas encontraba algún incidente, o sea todo daba "bajo" con score 0. Las
fechas ahora cubren el año completo (43-56 incidentes por mes); las
coordenadas, tipos y gravedades quedaron idénticas (los clusters no
cambian).

**3. El clustering no depende del polígono consultado (verificado).**
DBSCAN corre una sola vez sobre todos los incidentes y no recibe ningún
polígono; el barrido de `calibrar_parametros.py` da los mismos 27 clusters
(`EPS_KM=0.5`, `MIN_SAMPLES=5`) y hay tests que comprueban que 30 consultas
`/score` de rutas angostas dejan `/zonas-rojas` idéntico.

**4. Recalibración con la nueva población de solicitudes** (1 500 rutas de
10-500 m): `RISK_TAU=2.5` y los umbrales 34/67 siguen siendo los correctos
(con 3.5 casi desaparece "alto"; con 1.5 cualquier incidente leve ya sería
"medio"); `VENTANA_DIAS=45` se mantiene.

**5. E2E y latencia.** `tests/test_e2e_iniciar_trabajo.py` simula el flujo
completo (ruta → polígono → cuerpo idéntico al del Backend → respuesta) y
`scripts/smoke_test.py` hace lo mismo por HTTP contra un servidor local o
desplegado. Latencia medida: **p50 ≈ 3-14 ms, p95 ≈ 16-24 ms**. Ojo en
Windows: `http://localhost:8000` suma ~2 s por consulta (resuelve IPv6
primero); usar `http://127.0.0.1:8000` (importante para `RISK_SERVICE_URL`
del Backend).

**6. Despliegue y demo.** Ver [`DEPLOY.md`](DEPLOY.md) (Render, plan gratis y
su "sleep") y [`DEMO.md`](DEMO.md) (escenarios reales bajo/medio/alto con
coordenadas GPS y guion).

```bash
python scripts/smoke_test.py                       # local, debe dar TODO OK
python scripts/generar_escenarios_demo.py --fecha 2026-10-15
python scripts/probar_poligonos_ruta.py            # experimento del bug
```

Rama de trabajo: `nicolas-riesgo`.
