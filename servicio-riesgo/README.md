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
    "tipo_actividad": "PROGRAMADA",
    "hora_inicio": 23
  }'
```

```json
{"risk_score":99.15,"congestion_score":2.94,"nivel":"alto","n_incidentes_considerados":3,"buffer_aplicado_m":75.0,"explicacion":{"resumen":"Se encontraron 3 incidente(s) cercano(s) en los últimos 45 días (misma época del año): 1 de hurto, 1 de robo vehiculo, 1 de lesiones. La ventana solicitada es en horario nocturno (20:00-6:00), por lo que el riesgo se incrementó un 30%. Esta zona está en la comuna de Santiago, que según cifras oficiales del CEAD registra más delitos que el promedio nacional (factor 1.4597). Las calles más expuestas de la zona son Viel, Blanco Encalada, El Parque. La congestión viene del flujo vehicular de SECTRA, ajustado a las 23:00 h con un perfil horario típico (estimación: SECTRA no publica la hora del flujo).","incidentes_considerados":[{"tipo_incidente":"hurto","gravedad":"alta","fecha":"2025-05-16"},{"tipo_incidente":"robo_vehiculo","gravedad":"media","fecha":"2025-06-08"},{"tipo_incidente":"lesiones","gravedad":"baja","fecha":"2025-06-09"}],"franja_horaria":"noche","peso_nocturno_aplicado":true},"comuna_detectada":"SANTIAGO","fuente_congestion":"real (SECTRA, 296 calles cercanas)","calles_afectadas":[{"nombre":"Viel","risk_score":87.95,"congestion_score":6.52},{"nombre":"Blanco Encalada","risk_score":81.3,"congestion_score":6.52},{"nombre":"El Parque","risk_score":80.36,"congestion_score":1.3},{"nombre":"Manuel Antonio Matta","risk_score":78.65,"congestion_score":6.52},{"nombre":"Presidente Jorge Alessandri Rodriguez","risk_score":68.89,"congestion_score":11.74}],"tipo_actividad":"PROGRAMADA"}
```

`tipo_actividad` acepta exactamente los dos valores del enum real del
Backend: `"PROGRAMADA"` o `"EMERGENCIA"`. `hora_inicio` es opcional (0-23):
si no se envía, se asume mediodía (sin ponderación nocturna) y la congestión
queda con el flujo SECTRA sin modular; si se envía, pondera la noche
(Semana 5) y ajusta la congestión por hora (Semana 6). Desde la Semana 6 la
respuesta suma `calles_afectadas` y `RISK_TAU` es 3.5 — ver Semana 6.

`comuna_detectada` y `fuente_congestion` (abajo): si el polígono cae cerca
de una calle real de SECTRA, `congestion_score` y el riesgo usan dato real
(flujo vehicular + factor de criminalidad del CEAD, ver sección 4.1 de
Semana 5) en vez del proxy de densidad poblacional — mismo criterio que
`/ranking-inspecciones`, para que ambos den el mismo número ante la misma
obra.

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

## Semana 5 — Score explicado, riesgo por calle y datos reales (Anexo B)

Alcance definido en el Anexo B del plan tras la retroalimentación del
profesor. Resumen de qué se hizo y por qué:

**1. Score explicado.** `POST /score` ahora devuelve `explicacion`: un
`resumen` en texto simple (para un operador municipal no técnico) más el
detalle de qué incidentes contaron (tipo, gravedad, fecha) y en qué
franja horaria. Ejemplo arriba. Tests en `tests/test_explicacion.py`.

**2. Ponderación nocturna.** El dataset de incidentes no trae hora (solo
fecha), así que esto no reclasifica incidentes históricos por hora:
pondera la ventana de **la solicitud**. Si `hora_inicio` cae en horario
nocturno, se multiplica la suma de riesgo por `PESO_NOCTURNO` antes de la
saturación. El profesor no dio un criterio de "noche", así que quedó como
supuesto documentado y configurable por variable de entorno:

| Variable | Default | Qué es |
|---|---|---|
| `NOCHE_HORA_INICIO` / `NOCHE_HORA_FIN` | 20 / 6 | Rango horario considerado nocturno (circular, cruza medianoche) |
| `PESO_NOCTURNO` | 1.3 | Multiplicador sobre la suma de riesgo (no sobre el score final) |

Ejemplo real verificado (mismo polígono y fecha, solo cambia la hora):
`risk_score` 32.97 (bajo) de día → **40.55 (medio)** de noche — el peso
nocturno puede cambiar la decisión del operador, no solo mover el número.
Tests en `tests/test_peso_nocturno.py`. `hora_inicio` es opcional con
default 12 (mediodía) para no romper al Backend mientras Joshua no la
mande — **hoy `riskService.js` trunca `ventana_inicio` a solo la fecha**
(`.slice(0, 10)`), así que esta ponderación queda inactiva hasta que el
Backend empiece a mandar la hora real.

**3. Validación del polígono automático (tamaño real: 18×8 m, no los 20 m
usados como ejemplo en Semana 4).** `scripts/validar_poligono_automatico.py`
prueba 4 casos reales con y sin `BUFFER_BUSQUEDA_M`:

| Caso | Sin buffer | Con buffer (75 m) |
|---|---|---|
| (a) Sin incidentes ni manzanas cerca | risk 0.0, congestión 0.0 | igual |
| (b) Borde exacto de una manzana censal | risk 0.0, congestión 1.02 | igual (ya tocaba la manzana sin margen) |
| (c) Centro de la manzana más densa del dataset | risk 0.0, congestión 100.0 | igual (no había ningún incidente a menos de 75 m de ese punto) |
| (d) A 50 m de un incidente real (no encima) | risk 0.0, **bajo** | **risk 55.07, medio** |

Conclusión: con el tamaño real (18×8 m) el buffer no cambia el resultado
cuando ya se está exactamente sobre la manzana o lejos de todo — su
efecto real es el caso (d), que es el más representativo de una solicitud
real (el camión rara vez para exactamente sobre el punto de un incidente
pasado, pero sí cerca). Confirma que `BUFFER_BUSQUEDA_M=75` sigue siendo
necesario con el tamaño real del polígono.

**4. Riesgo y congestión por calle real — `GET /calles-riesgo` (nuevo).**
Pedía el equipo poder "pintar las calles en rojo" en el mapa. Se evaluaron
3 diseños (grilla, por comuna, por calle real) y se eligió **por calle
real**, reutilizando el flujo vehicular verídico de SECTRA (ver
`docs/investigacion-datos-riesgo-congestion.md`) tanto para la geometría de
las calles como para la congestión — y el dataset de incidentes simulado
para el riesgo de cada tramo:

```bash
curl http://localhost:8000/calles-riesgo
curl "http://localhost:8000/calles-riesgo?comuna=PROVIDENCIA"
```

Devuelve `{ total_calles, fuente_datos, calles: [...] }`, cada calle con
`nombre`, `comuna`, `risk_score`, `congestion_score` (del flujo vehicular
real, no de densidad poblacional), `flujo_vehicular_hora`,
`n_incidentes`, `factor_criminalidad_real` y `geometry_geojson`
(LineString) para pintarla en el mapa. Se calcula una vez al levantar el
servicio sobre **7.459 tramos reales** dentro del área del proyecto
(Santiago Centro, Providencia, Ñuñoa, Vitacura y alrededores) — si SECTRA
no responde al generar el dataset, cae a una red de calles simulada
equivalente (`app/data/calles.py`), mismo patrón de respaldo que ya usan
incidentes y censo.

**4.1 Integración de criminalidad real por comuna.** Cada tramo de SECTRA
ya trae su `comuna` real, así que el riesgo simulado de cada calle se
escala por el **factor de criminalidad real** de esa comuna —capturado a
mano del CEAD (`cead.minsegpublica.gob.cl`, sin API, ver
`app/data/criminalidad_real.py`), tasa cada 100.000 habitantes de las 7
familias de delito, 2025, relativa al promedio nacional (9.789,3):

| Comuna | Tasa real 2025 | Factor (vs. promedio nacional) |
|---|---|---|
| Providencia | 16.260,7 | 1,66 |
| **Santiago** (comuna de referencia — mayor volumen: 78.902 casos en 2025, ~4% del total país) | 14.289,9 | **1,46** |
| Estación Central | 11.324,2 | 1,16 |
| Recoleta | 10.478,5 | 1,07 |
| Ñuñoa | 9.654,3 | 0,99 |
| Vitacura | 8.311,7 | 0,85 |
| Renca | 8.286,4 | 0,85 |
| Macul | 8.693,7 | 0,89 |
| Independencia | 8.185,4 | 0,84 |
| Las Condes | 7.572,9 | 0,77 |

Comunas de SECTRA sin dato capturado (Cerrillos, Conchalí, PAC, Quinta
Normal, San Joaquín, San Miguel) usan factor neutro `1.0` — mejor no
ajustar que inventar un sesgo sin evidencia. Verificado en vivo: el mismo
número de incidentes simulados (1) da `risk_score: 82.65` en una calle de
Santiago y `risk_score: 60.48` en una de Las Condes — el factor real sí
cambia el resultado. **Actualización:** al principio `/score` no usaba
este factor (el polígono libre de una solicitud no tiene comuna real
asociada por sí solo) — limitación que anticipaba
`docs/investigacion-datos-riesgo-congestion.md`, sección 3. Se resolvió
reutilizando `datos_reales_cerca()`: `/score` también busca si hay una
calle real de SECTRA cerca del polígono y, si la hay, toma su comuna —
ver sección 4.1 de arriba (`comuna_detectada`, `fuente_congestion`).

**5. (P2) Asignación inteligente — `POST /ranking-inspecciones`.**
Recibe una lista de obras activas (id, polígono, fecha, si tiene una
emergencia activa) y devuelve el orden en que el Supervisor debería
visitarlas: las emergencias activas siempre primero, después por un score
combinado de riesgo (60%) y congestión (40%). No persiste nada — es una
función de orden sobre datos que el Backend ya tiene.

**Usa datos reales cuando puede.** Si la obra cae cerca de una calle de
SECTRA (misma búsqueda de `BUFFER_BUSQUEDA_M` que usa `/score`), la
congestión viene del flujo vehicular real (no del proxy de densidad
poblacional) y el riesgo se escala por el factor de criminalidad real de
esa comuna (CEAD) — `calcular_score` ahora acepta un
`factor_criminalidad` opcional para esto. Si no hay ninguna calle real
cerca, cae al mismo proxy que usa `/score`. La respuesta informa cuál se
usó en `comuna_detectada` y `fuente_congestion`.

```bash
curl -X POST http://localhost:8000/ranking-inspecciones \
  -H "Content-Type: application/json" \
  -d '{"obras": [{"id": "permiso-1", "poligono": {"type":"Polygon","coordinates":[[[-70.665,-33.465],[-70.650,-33.465],[-70.650,-33.450],[-70.665,-33.450],[-70.665,-33.465]]]}, "fecha": "2025-05-15"}]}'
```

Verificado en vivo con 3 obras: una con emergencia activa (siempre
primero, aunque empate en `prioridad_score`), una lejos de toda calle
real (`fuente_congestion: "estimada..."`) y una en Renca
(`fuente_congestion: "real (SECTRA, 21 calles cercanas)"`,
`comuna_detectada: "RENCA"`).

**6. Investigación de fuentes de datos (Parte B del Anexo B).** Ver
[`docs/investigacion-datos-riesgo-congestion.md`](../docs/investigacion-datos-riesgo-congestion.md)
(desde la raíz del repo) — comparación verificada de fuentes de
congestión y criminalidad, con fechas de última actualización reales
comprobadas, no asumidas. Hallazgos relevantes: el portal nacional
`datos.gob.cl` tiene **todos** sus datasets de criminalidad sin
actualizar desde 2015 (verificado); el dominio clásico del CEAD
(`cead.spd.gov.cl`, citado en toda la documentación pública) está
muerto porque el ministerio se reestructuró, pero el portal **sigue
vivo** en `cead.minsegpublica.gob.cl` — probado en vivo: consulta real
por comuna, exportación a Excel y mapa coroplético, con datos hasta
2026. No tiene API REST (solo el formulario web), así que la
integración sería descarga manual periódica, no una llamada automática
del servicio.

Rama de trabajo: `nicolas-riesgo`.

## Semana 6 — Santiago Centro: mapa de riesgo y congestión por calle

Pedido del profesor: usar mejor SECTRA y CEAD para que **Santiago Centro**
funcione de forma óptima — ver congestión y riesgo por calle, dibujar las
calles del mapa según esas métricas y que la municipalidad las use para
decidir. Antes de tocar nada se midió cómo estaba (`scripts/calibrar_santiago.py`):

| Medición (2.278 calles reales de Santiago) | Antes | Ahora |
|---|---|---|
| Calles con riesgo 0 (mapa verde) | **98 %** | 0 % |
| Rutas de 150 m en Santiago con `/score` = 0.0 | **92 %** | 0 % |
| Calles por nivel (bajo / medio / alto) | 98 % / 1 % / 1 % | 33 % / 47 % / 20 % |
| Rutas `/score` bajo / medio / alto (umbrales 34/67) | 92 % / 4 % / 4 % | 62 % / 30 % / 9 % |

**Por qué estaba así:** solo hay 594 incidentes simulados repartidos en
todo el bbox, así que casi ninguna calle tenía uno cerca. Y al revés, las
rutas que sí tenían incidentes saturaban cerca de 100 porque el factor CEAD
de Santiago (≈1.46) multiplicaba todo.

### 1. Riesgo por calle: el total de CEAD repartido entre las calles

No existen incidentes puntuales reales públicos (CEAD solo publica totales
por comuna). Para no depender solo de los simulados, el total real de
delitos de Santiago (78.902 casos policiales 2025) se **reparte entre sus
calles** según `largo del tramo × flujo vehicular SECTRA`:

- `participación_i = (largo_i × flujo_i) / Σ(largo × flujo)` de la comuna.
- `casos_estimados_i = total CEAD × participación_i` (la suma da exactamente
  78.902; hay un test). Solo se calcula en comunas con total capturado
  (hoy Santiago); en las demás es `null`.
- `exposicion_relativa_i = participación_i × n.º de tramos` → 1.0 es un
  tramo típico de su comuna (con tope `EXPOSICION_MAX = 8`).
- Riesgo de la calle, **con la misma fórmula que `/score`**:
  `suma = (incidentes_ponderados_del_corredor + BETA_EXPOSICION × exposición) × factor_CEAD`
  y `risk_score = 100 × (1 − e^(−suma / RISK_TAU))`.

**Es una estimación, no un dato puntual real** — por eso cada calle trae
`fuente_riesgo: "CEAD distribuido por flujo (estimación)"`. No se pondera
por jerarquía vial (`clase`) porque el flujo ya la refleja y sumar otro
multiplicador sería un supuesto sin evidencia.

### 2. Niveles relativos a la comuna (mapa) vs. absolutos (`/score`)

- En el **mapa**, `nivel` es relativo a la comuna: bajo ≤ p33, medio hasta
  p80, alto > p80 del riesgo de las calles de esa comuna. Sirve para decidir
  *dónde mirar primero*. Comunas con menos de 50 calles usan los percentiles
  de toda la red. La leyenda del GeoJSON trae el rango real de cada nivel.
- En `/score`, `nivel` sigue siendo **absoluto** (umbrales 34 / 67), porque
  decide si una solicitud entra a la cola de espera. Una calle "alta" del
  mapa puede tener un `risk_score` de 20 y no es una contradicción: es de las
  más expuestas de Santiago, no una zona crítica en términos absolutos.

### 3. `RISK_TAU` 2.5 → 3.5 y exposición en `/score`

Con el reparto de CEAD, `/score` suma a los incidentes una línea base:
`exposición máxima de las calles cercanas × BETA_EXPOSICION` (0.35). Se usa
el **máximo** (no el promedio) para mantener la propiedad de Semana 4: *una
ruta más larga nunca baja el riesgo* (hay un test). `RISK_TAU` sube de 2.5 a
3.5 porque la suma ahora es más grande; se probaron combinaciones sobre 300
rutas de Santiago (ver `scripts/calibrar_santiago.py`) y esta dejó la mejor
distribución. Quien quiera otros valores: `BETA_EXPOSICION` y
`EXPOSICION_MAX` son variables de entorno; `RISK_TAU` está en `scoring.py`.

Efecto en los escenarios de la demo (fecha 2026-10-15): "alto" 86.47 → 76.03,
"sin incidentes" 0.0 → 6.69 (queda la línea base de Renca, sigue siendo
bajo), y el punto de Quinta Normal pasó de bajo (32.97) a medio (38.58).
`DEMO.md`, `tests/test_escenarios.py` y `scripts/smoke_test.py` están
actualizados.

### 4. Congestión escalonada y por hora

El flujo SECTRA (`flujo_v_h`) es un **cálculo del modelo de transporte** y
viene en escalones de ~1.111 veh/h: en toda Santiago hay solo **7 valores
distintos** y el 76 % de las calles está en el escalón base. No se puede
inventar más precisión que esa, así que:

- `nivel_congestion` es escalonado según el flujo: **bajo** < 2.000 veh/h,
  **medio** 2.000–3.999, **alto** ≥ 4.000.
- Con `hora` (0-23) el flujo se modula con un **perfil horario típico de día
  hábil** (`app/services/congestion.py`): punta de mañana (7-9 h) y de tarde
  (17-19 h) = 1.0, mediodía ≈ 0.8, noche ≈ 0.2–0.4.
- **Supuesto explícito:** SECTRA no publica a qué hora corresponde el flujo
  de esta capa; se toma como hora de máxima demanda. El perfil es un
  supuesto de trabajo, no un dato SECTRA, y la respuesta lo avisa
  (`congestion_es_estimada_por_hora: true`).
- Sin `hora`, el flujo SECTRA queda sin modular (como antes).

### 5. `GET /calles-riesgo` listo para pintar el mapa

Parámetros (todos opcionales; sin ellos la respuesta es igual que en la
Semana 5, solo con campos aditivos nuevos):

| Parámetro | Valores | Para qué |
|---|---|---|
| `comuna` | `SANTIAGO`, … | Filtra por comuna |
| `metrica` | `riesgo` (def.) \| `congestion` | Qué métrica define el `color` |
| `hora` | 0–23 | Modula la congestión (estimación) |
| `bbox` | `minLon,minLat,maxLon,maxLat` | Solo calles que toquen esa caja (422 si es inválido) |
| `formato` | `json` (def.) \| `geojson` | `geojson` devuelve una FeatureCollection |

```bash
curl "http://localhost:8000/calles-riesgo?comuna=SANTIAGO&formato=geojson&metrica=riesgo&hora=18"
```

```json
{"type":"FeatureCollection",
 "features":[{"type":"Feature",
   "geometry":{"type":"LineString","coordinates":[[-70.656411,-33.460437],[-70.656453,-33.45941]]},
   "properties":{"calle_id":5403,"nombre":"VIEL","comuna":"SANTIAGO","risk_score":87.95,"nivel":"alto",
                 "congestion_score":21.74,"nivel_congestion":"medio","flujo_vehicular_hora":3332.0,
                 "n_incidentes":1,"color":"#C62828"}}],
 "metadata":{"total":2278,"comuna":"SANTIAGO","metrica":"riesgo","hora":18,
             "congestion_es_estimada_por_hora":true,"fuente_datos":"…",
             "leyenda":[{"nivel":"bajo","color":"#2E7D32","rango":"0.87 a 6.73","criterio":"relativo a Santiago"},
                        {"nivel":"medio","color":"#F9A825","rango":"6.74 a 17.01","criterio":"relativo a Santiago"},
                        {"nivel":"alto","color":"#C62828","rango":"17.05 a 87.95","criterio":"relativo a Santiago"}]}}
```

Para MapLibre basta `"line-color": ["get", "color"]`. Colores verde
`#2E7D32` / ámbar `#F9A825` / rojo `#C62828`, legibles sobre mapa claro.
Con `formato=json` (por defecto) cada calle suma `nivel_congestion`,
`casos_estimados` y `fuente_riesgo` a los campos de la Semana 5.

**Peso medido** (Santiago, 2.278 calles): 0,80 MB sin comprimir → **~66 KB
con gzip** (el servicio comprime solo si el cliente manda
`Accept-Encoding: gzip`, que los navegadores hacen). Toda la red (7.459
calles): 2,6 MB → 0,24 MB. La geometría se simplifica a ~2 m y 6 decimales,
imperceptible en el mapa. No hizo falta paginar.

### 6. `POST /score`: calles afectadas y explicación

- Nuevo campo `calles_afectadas`: hasta 5 calles reales más expuestas dentro
  de la zona (sin repetir nombre), con `nombre`, `risk_score` y
  `congestion_score`. Vacío si no hay calle SECTRA cerca.
- `hora_inicio` ahora también ajusta la **congestión** (si viene). Si no
  viene, se asume mediodía para el peso nocturno y la congestión queda sin
  modular — el Backend actual no se rompe.
- `explicacion.resumen` nombra las calles más expuestas, dice si la
  congestión es real (SECTRA) o estimada por densidad poblacional, y si fue
  ajustada por hora.

### 7. `GET /health`: cobertura de datos

Nuevo `cobertura_calles` (`tramos_con_comuna`, `tramos_sin_comuna`,
`tramos_sin_nombre`, `comunas`, `tramos_santiago`) para detectar un cruce
calle-comuna incompleto sin abrir el archivo. En la medición actual: 7.458
de 7.459 tramos con comuna, 0 sin nombre, 16 comunas, 2.278 en Santiago.

### 8. Límites que hay que decir con honestidad

- El riesgo por calle es una **estimación** (total real de la comuna
  repartido por flujo × largo), no incidentes reales ubicados.
- El total repartido existe solo para Santiago (78.902 casos); las demás
  comunas solo tienen la tasa, así que usan el factor relativo.
- La congestión SECTRA tiene 7 escalones y una sola hora; el perfil horario
  es un supuesto.
- Los incidentes puntuales siguen siendo simulados (594), y el CEAD está
  capturado a mano (no tiene API): hay que actualizar
  `app/data/criminalidad_real.py` si se quiere refrescar.
- Los niveles del mapa son relativos a cada comuna; no se pueden comparar
  entre comunas.

### 9. Tests y verificación

`tests/test_santiago_mapa.py` (28 tests): distribución por niveles ≤ 60 %,
suma del reparto = total CEAD, comuna sin total no inventa casos, hora,
GeoJSON (forma, color por métrica, leyenda), bbox, gzip y peso < 1,5 MB,
`calles_afectadas`, monotonía de la ruta más larga y línea base sin
incidentes. `scripts/smoke_test.py` cubre los endpoints nuevos contra un
servicio real. Suite completa: 90 tests.
