# Despliegue del microservicio de riesgo en Render

Requiere tu cuenta de Render (gratis) conectada a GitHub — eso lo haces tú;
el resto ya está listo en el repo (`render.yaml`, `requirements.txt`,
`/health`, `scripts/smoke_test.py`).

## Antes de desplegar

- El PR `nicolas-riesgo -> develop` tiene que estar mergeado (Render clona la
  rama que le indiques; `render.yaml` apunta a `develop`).
- Comprobado localmente: arranca en ~1.5 s, usa ~200 MB de RAM (el plan gratis
  de Render da 512 MB) y responde `/score` en ~15 ms.
- Las dependencias fijadas tienen wheels precompilados para Linux x86_64 con
  Python 3.12 y 3.13 (verificado con `pip install --dry-run --platform ...`),
  así que la instalación en Render no compila nada.

## Opción A — Manual (la más segura, paso a paso)

1. Render → **New +** → **Web Service** → conecta el repo
   `ViaSegura-Ecosistema-Municipal`.
2. Completa (los nombres exactos de los campos pueden variar un poco en la
   interfaz de Render):

   | Campo | Valor |
   |---|---|
   | Name | `viasegura-riesgo` |
   | Branch | `develop` |
   | Root Directory | `servicio-riesgo` |
   | Runtime | Python 3 |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | Health Check Path | `/health` |
   | Instance Type | Free (o Starter, ver "Plan gratis y la demo") |

3. En **Environment** agrega `PYTHON_VERSION` = `3.13.5` y
   `BUFFER_BUSQUEDA_M` = `75`.
4. **Create Web Service**. La primera construcción tarda unos minutos.

## Opción B — Blueprint

**New +** → **Blueprint** → elige el repo e indica que el archivo es
`servicio-riesgo/render.yaml` (si tu pantalla no deja elegir la ruta,
usa la Opción A).

## Verificar que quedó bien

Con la URL que te asigne Render (`https://viasegura-riesgo.onrender.com` o similar):

```bash
python scripts/smoke_test.py --url https://TU-SERVICIO.onrender.com --max-p95-ms 3000
```

Debe terminar en `TODO OK`. Prueba el flujo completo (los 3 niveles de
riesgo, rechazo de datos inválidos, zonas rojas y latencia) usando solo la
biblioteca estándar de Python, sin instalar nada.

## Conectar el Backend (Joshua)

En el backend, `RISK_SERVICE_URL` apunta al servicio. Para el despliegue:

```
RISK_SERVICE_URL=https://TU-SERVICIO.onrender.com
```

Para desarrollo **local en Windows** usa `http://127.0.0.1:8000`, no
`http://localhost:8000`: `localhost` intenta IPv6 primero y cada consulta
pierde ~2 s (medido: 2050 ms contra 3 ms).

## Plan gratis y la demo (importante)

El plan gratis **duerme el servicio tras 15 min sin tráfico** y tarda
entre 30 y 60 s en despertar. El Backend consulta con un timeout de 5 s
(`riskService.js`), y si expira crea el permiso **sin evaluación de
riesgo** (el `catch` de `permisoController.crear`). Para que la demo no
falle por esto, cualquiera de estas opciones:

1. **Despertarlo antes**: 2 minutos antes de la demo, abre
   `https://TU-SERVICIO.onrender.com/health` y espera a que responda.
2. **Ping cada 10 min** con un monitor gratuito (UptimeRobot, cron-job.org)
   a `/health`, para que nunca se duerma.
3. **Plan Starter** (~7 USD/mes): no se duerme.
4. Pedirle a Joshua un timeout mayor (o un reintento) solo en la primera
   consulta.

Detalles de la Semana 6 a tener presentes:

- `data/calles_sectra.geojson` va **versionado en el repo**: el servicio no
  depende de que SECTRA responda al arrancar. Si el archivo faltara, intenta
  descargarlo y, si SECTRA tampoco responde, usa una red simulada;
  `GET /health` lo dice en `datasets.tramos_calle_origen`
  (`["sectra_real"]` o `["simulado_respaldo"]`). Compruébalo después de cada
  despliegue.
- Al arrancar se precalcula el riesgo de las 7.459 calles (unos segundos).
  La **primera** consulta de `/calles-riesgo` con una `hora` nueva arma su
  caché (~0,2 s); las siguientes son inmediatas.
- `/calles-riesgo?comuna=SANTIAGO&formato=geojson` pesa ~66 KB comprimido, así
  que no afecta el plan gratis. El navegador pide gzip solo.

## Variables de entorno

| Variable | Default | Para qué |
|---|---|---|
| `PORT` | lo pone Render | Puerto (el `startCommand` ya usa `$PORT`) |
| `BUFFER_BUSQUEDA_M` | `75` | Margen en metros alrededor del polígono recibido. `0` lo desactiva |
| `BETA_EXPOSICION` | `0.35` | Peso de la línea base de exposición vial (CEAD repartido por calle) frente a un incidente. Ver README, Semana 6 |
| `EXPOSICION_MAX` | `8` | Tope de la exposición relativa de un solo tramo |
| `COMUNA_PRINCIPAL` | `SANTIAGO` | Comuna que `/health` reporta en `cobertura_calles` |
| `INCIDENTS_DATASET_PATH` / `INE_CENSUS_DATA_PATH` | `./data/*.csv` | Rutas de los datasets (ya vienen en el repo) |

## Seguridad

El servicio no tiene autenticación: cualquiera con la URL puede consultar
`/score`. Hoy es aceptable (datasets simulados, sin datos personales), pero
si se conectan datos reales conviene agregar una API key compartida con el
Backend (requiere que Joshua envíe el header), fuera del alcance del feature
freeze.
