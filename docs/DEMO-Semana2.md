# Demo Semana 2 — Solicitud extremo a extremo

Pasos para mostrar en vivo el hito transversal de Semana 2: una solicitud
creada desde la app móvil llega al Backend, que evalúa contra el
Microservicio de Riesgo y refleja el estado real.

**Esta guía está verificada contra la base Supabase real** (no son
suposiciones) — se probó registro, login, dashboard y creación de un permiso
de punta a punta el 2026-09-07 contra el código de `joshua-backend-v2`
corriendo en un worktree aparte, con `cors()` parchado localmente para poder
probar desde el navegador (parche NO aplicado en la rama de Joshua, ver
"Reportar a Joshua" más abajo).

## 0. Requisito previo (bloqueante)

El flujo de permisos (`POST /api/permisos`, `PATCH /api/permisos/:id/activar`,
`POST /api/auth/registrar`) vive hoy en la rama `joshua-backend-v2` de Joshua,
**no está mergeada a `develop`**. Sin ese merge, el Backend en `develop` solo
tiene `/api/auth/login` y `/api/auth/me` contra un esquema de base viejo que
**ya no coincide con la base real de Supabase** (la base ya fue migrada al
esquema nuevo de `joshua-backend-v2`). Coordinar con Joshua para que abra su
PR antes de ensayar la demo — sin su código, literalmente no hay con qué
hablar.

## 1. Levantar los tres servicios

```bash
# Terminal 1 — Microservicio de Riesgo (Nicolas)
cd servicio-riesgo
uvicorn app.main:app --reload            # http://localhost:8000

# Terminal 2 — Backend Core (Joshua, rama joshua-backend-v2)
cd backend
node src/server.js                       # http://localhost:3000

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

`backend/.env` necesita `DATABASE_URL` y `JWT_SECRET` reales (pedirlos al
equipo, no están en el repo por seguridad).

## 2. Crear un usuario Chofer

No hay usuarios de prueba con contraseña conocida precargados. Registrar
desde la propia app:

1. Abrir la app → "¿No tienes cuenta? Regístrate".
2. Rol: `Chofer / Logística`.
3. **Completar el "ID de empresa (UUID)"** — el registro falla si se deja
   vacío (constraint `usuario_rol_scope`: CHOFER/LOGISTICA exigen
   `empresa_id`, no aceptan `comuna_id`). No hay selector de empresas
   todavía — pedir el UUID a Joshua o consultarlo directo en la base.
4. Al registrarse, la app guarda el JWT y navega directo a las tabs de Chofer.

Para un usuario Inspector es al revés: exige "ID de comuna (UUID)" y prohíbe
empresa.

## 3. Crear la solicitud

1. Tab "Nueva solicitud".
2. Tocar el mapa para marcar al menos 3 puntos del polígono del área de
   trabajo (la app cierra el anillo automáticamente al enviar — no hace falta
   tocar el primer punto dos veces).
3. Completar RUT del ejecutor, **comuna (UUID, no hay selector todavía)**,
   tipo de actividad (`Programada` o `Emergencia` — es un enum, no texto
   libre), altura estimada, ventana de fechas.
4. "Enviar solicitud" → responde con el permiso creado, estado inicial
   `PENDIENTE_CONFIRMACION_MUNICIPAL`.

**Esto NO dispara ninguna consulta al Microservicio de Riesgo de Nicolás.**
Se verificó leyendo el código de `joshua-backend-v2`: `axios` ni siquiera está
en su `package.json`, y `permisoController.crear()` inserta el permiso directo
en la base sin llamar a `RISK_SERVICE_URL` en ningún lado. El score de riesgo
que exige el hito de Semana 2 no está integrado todavía — ver el punto 0 de
"Reportar a Joshua" más abajo, es el hallazgo más importante de esta guía.

## 4. Geofencing + foto (opcional en la demo)

Desde la pantalla de éxito de la solicitud, "Confirmar llegada" → toma una
foto → `PATCH /api/permisos/:id/activar`. Va a devolver 409 porque el permiso
recién creado está en `PENDIENTE_CONFIRMACION_MUNICIPAL`, no en `APROBADO`
(el estado real tiene 8 valores — `PENDIENTE_CONFIRMACION_MUNICIPAL`,
`APROBADO`, `EN_COLA_ESPERA`, `ACTIVO`, `ACTIVO_PENDIENTE_EVIDENCIA`,
`FINALIZADO`, `EXPIRADO`, `REVOCADO` — y todavía no existe ningún endpoint que
mueva un permiso de un estado a otro después de crearlo). Esperado por ahora,
no es un bug del Frontend.

## 5. Botón de pánico (opcional en la demo)

Tab "Pánico" → botón SOS. El cliente se conecta por Socket.io y emite
`panico:enviar`. **El servidor de `joshua-backend-v2` ni siquiera monta
Socket.io** (se perdió en la reescritura respecto al `develop` viejo, que sí
tenía `io.on('connection', ...)` aunque sin handler de pánico tampoco) — hoy
no hay ningún canal de WebSocket funcionando en esa rama.

## 6. Dashboard — Bandeja de decisiones

Login en `http://localhost:5173` con el mismo backend — **funciona real,
probado**: usuario Operador Municipal registrado, JWT emitido, dashboard
renderiza la bandeja. La tabla de solicitudes pendientes depende de
`GET /api/permisos`, que **no existe** — el panel muestra un aviso
"Pendiente: el Backend aún no expone GET /api/permisos" en vez de romperse.
El mapa (MapLibre) sí funciona sin depender del Backend.

## Reportar a Joshua (bugs confirmados, no suposiciones)

0. **El Backend no consulta al Microservicio de Riesgo — el hito transversal
   de Semana 2 no está cerrado.** El módulo de Nicolás (`nicolas-riesgo`) SÍ
   está listo: `POST /score` (risk_score/congestion_score/nivel real, con
   `shapely`) y `GET /zonas-rojas` (clustering DBSCAN normalizado por
   densidad), con tests y README. El problema es 100% del lado del Backend:
   `crear()` en `permisoController.js` nunca llama a ese servicio.
   Falta (a) agregar `axios` a `package.json`, (b) llamar a
   `POST {RISK_SERVICE_URL}/score` con el polígono/fecha/tipo de la solicitud
   antes o después de insertarla, y (c) guardar el resultado en el permiso
   (o en `evaluacion_riesgo`, que ya existe como tabla). Sin esto, el plan de
   proyecto literalmente no se cumple ("una solicitud creada desde la app
   llega al Backend, que consulta al Microservicio de Riesgo y recibe un
   score real, no mockeado" — criterio de éxito del Hito Semana 2).
1. **Falta `app.use(cors())` en `backend/src/app.js`.** El paquete `cors` está
   en `package.json` pero nunca se usa. Sin esto, **ningún navegador puede
   hablarle al Backend** (el dashboard entero queda bloqueado) — por `curl`
   sí responde, por eso pasó desapercibido. Se probó y confirmado: agregar
   `app.use(cors())` antes de las rutas lo arregla.
2. **No hay middleware de manejo de errores.** Cualquier error (constraint de
   base, enum inválido, etc.) devuelve la página HTML de error por defecto de
   Express en vez de JSON `{ error: "..." }`. Rompe cualquier frontend que
   espere JSON (el dashboard y la app ya están preparados para JSON, así que
   hoy muestran mensajes de error genéricos/feos en vez del mensaje real).
3. `registrar()` no valida `empresa_id`/`comuna_id` antes de insertar — deja
   que el constraint de Postgres reviente con un error críptico. Sería mejor
   validar en el controller y devolver 400 con un mensaje claro.
4. Confirmar el enum `rol_usuario` real: `CHOFER`, `LOGISTICA`,
   `OPERADOR_MUNICIPAL`, `INSPECTOR_MUNICIPAL` (documentarlo en el README del
   backend, no está escrito en ningún lado del código).
5. Confirmar el enum `tipo_actividad`: `PROGRAMADA`, `EMERGENCIA` — el nombre
   del campo es engañoso, no es una categoría de carga.
6. `crear()` no cierra el anillo del polígono — el caller debe mandar el
   primer punto repetido al final o PostGIS rechaza la geometría.

## Pendientes para que la demo sea 100% en vivo

- **Integrar el Backend con `POST /score` de `servicio-riesgo`** (punto 0 de
  arriba) — es el requisito más importante, literalmente el hito de Semana 2.
- Mergear `joshua-backend-v2` → `develop` (o al menos aplicarle el fix de
  CORS del punto 1 de arriba, si no hay tiempo de mergear todo).
- Mergear `nicolas-riesgo` → `develop` — su trabajo de Semana 2 ya está listo
  y esperando.
- `GET /api/permisos` (listado) — lo necesita el dashboard del Operador.
- Un endpoint o mecanismo que mueva el permiso de
  `PENDIENTE_CONFIRMACION_MUNICIPAL` a `APROBADO` (evaluación automática por
  riesgo, o aprobación manual) — sin esto, `activar` siempre devuelve 409.
- Montar Socket.io en `joshua-backend-v2` y agregar el listener de
  `panico:enviar` → `panico:confirmado`.
- Endpoint de listado de comunas (`GET /api/comunas`) y empresas
  (`GET /api/empresas`) para reemplazar los inputs de UUID a mano por
  selectores.

Si alguno de estos no está listo a tiempo, la mitigación del plan (sección de
riesgos, punto 2) aplica: mostrar el flujo mínimo que sí funciona en vivo
(solicitud → llega al Backend → consulta al microservicio de riesgo) y usar el
video de respaldo para el resto.
