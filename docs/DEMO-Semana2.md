# Demo Semana 2 — Solicitud extremo a extremo

Pasos para mostrar en vivo el hito transversal de Semana 2: una solicitud
creada desde la app móvil llega al Backend, que evalúa contra el
Microservicio de Riesgo y refleja el estado real.

## 0. Requisito previo (bloqueante)

El flujo de permisos (`POST /api/permisos`, `PATCH /api/permisos/:id/activar`)
vive hoy en la rama `joshua-backend-v2` de Joshua, **no está mergeada a
`develop`**. Sin ese merge, el Backend en `develop` solo tiene
`/api/auth/login` y `/api/auth/me` — el formulario de solicitud no tiene con
qué hablar. Coordinar con Joshua para que abra su PR antes de ensayar la demo.

## 1. Levantar los tres servicios

```bash
# Terminal 1 — Microservicio de Riesgo (Nicolas)
cd servicio-riesgo
uvicorn app.main:app --reload            # http://localhost:8000

# Terminal 2 — Backend Core (Joshua)
cd backend
npm run dev                              # http://localhost:3000

# Terminal 3 — Dashboard (Agustin)
cd dashboard
npm run dev                              # http://localhost:5173
```

App móvil (Expo Go normal — el mapa es un WebView con MapLibre GL JS, no
requiere development build):

```bash
cd app-movil
npm start                 # escanear el QR con Expo Go
```

Antes de correr la app, editar `app-movil/src/config.js` y
`dashboard/.env` (`VITE_API_BASE_URL`) con la IP de tu red local si vas a usar
un dispositivo físico o emulador (no `localhost`).

## 2. Crear un usuario Chofer

Con `joshua-backend-v2` mergeado, `npm run seed` fue removido en la
reescritura — no hay usuarios de prueba precargados. Usar el registro desde la
propia app:

1. Abrir la app → "¿No tienes cuenta? Regístrate".
2. Rol: `CHOFER`, completar nombre/RUT/email/password.
3. Al registrarse, la app guarda el JWT y navega directo a las tabs de Chofer.

## 3. Crear la solicitud

1. Tab "Nueva solicitud".
2. Tocar el mapa para marcar al menos 3 puntos del polígono del área de
   trabajo.
3. Completar RUT del ejecutor, comuna (ID numérico — no hay selector de
   comunas todavía, ver sección "Pendientes"), tipo de actividad, altura
   estimada, ventana de fechas.
4. "Enviar solicitud" → debe responder con el permiso creado y su estado.

Esto dispara, del lado del Backend, la consulta HTTP al Microservicio de
Riesgo de Nicolas (Axios) — verificar en la consola de `servicio-riesgo` que
llegó la petición de scoring.

## 4. Geofencing + foto (opcional en la demo)

Desde la pantalla de éxito de la solicitud, "Confirmar llegada" → toma una
foto → `PATCH /api/permisos/:id/activar`. Va a devolver 409 a menos que el
permiso ya esté en estado `APROBADO` (todavía no existe un endpoint de
aprobación/evaluación automática en el Backend) — esperado por ahora, no es un
bug del Frontend.

## 5. Botón de pánico (opcional en la demo)

Tab "Pánico" → botón SOS. El cliente se conecta por Socket.io y emite
`panico:enviar`. **El servidor todavía no tiene el listener** de ese evento
(solo acepta la conexión), así que hoy no vas a ver el estado "confirmado" —
hace falta que Joshua agregue el handler de `panico:enviar` /
`panico:confirmado` en el Backend.

## 6. Dashboard — Bandeja de decisiones

Login en `http://localhost:5173` con el mismo backend. La tabla de
solicitudes pendientes depende de `GET /api/permisos`, que **tampoco existe
todavía** — el panel muestra un aviso "Pendiente: el Backend aún no expone
GET /api/permisos" en vez de romperse. El mapa (MapLibre) sí funciona sin
depender del Backend.

## Pendientes para que la demo sea 100% en vivo (no solo "solicitud creada")

Para pasarle a Joshua / coordinar en el grupo:
- Mergear `joshua-backend-v2` → `develop` (o cherry-pick del código de
  permisos) para que exista `/api/permisos`.
- `GET /api/permisos` (listado) — lo necesita el dashboard del Operador.
- Un endpoint o mecanismo que mueva el permiso a estado `APROBADO` (evaluación
  automática por riesgo, o aprobación manual) — sin esto, `activar` siempre
  devuelve 409.
- Listener del servidor Socket.io para `panico:enviar` → `panico:confirmado`.
- Endpoint de listado de comunas (`GET /api/comunas`) para reemplazar el
  input numérico de `comuna_id` por un selector.

Si alguno de estos no está listo a tiempo, la mitigación del plan (sección de
riesgos, punto 2) aplica: mostrar el flujo mínimo que sí funciona en vivo
(solicitud → llega al Backend → consulta al microservicio de riesgo) y usar el
video de respaldo para el resto.
