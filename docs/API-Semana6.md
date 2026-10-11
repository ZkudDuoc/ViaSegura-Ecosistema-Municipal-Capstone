# API — Semana 6 (cambios del feedback del profesor)

Base: `/api`. Todos los endpoints (salvo los marcados *público*) requieren `Authorization: Bearer <token>`.
Errores: siempre `{ "error": "mensaje" }` con mensajes fijos (nunca se filtra el detalle de Postgres).

## 0. Migraciones a correr (en este orden)

| Archivo | Qué hace | Nota |
|---|---|---|
| `010_semana6_empresa.sql` | columnas de empresa, tabla `trabajador`, `permiso.empresa_id` (+backfill y trigger), `riesgo_pendiente`, datos de revisión, `vehiculo.activo`, índices, comuna **Santiago Centro** | idempotente |
| `011_semana6_en_revision.sql` | agrega el estado `EN_REVISION` | **correr SOLA** (un valor nuevo de enum no se puede usar en la misma transacción) |
| `012_semana6_jobs.sql` | job que expira solicitudes pendientes / en cola / en revisión con la ventana vencida | requiere 011 |

Variables nuevas (ver `backend/.env.example`): `CORS_ORIGINS`, `TRUST_PROXY`, `RATE_LIMIT_AUTH_MAX`, `RIESGO_CACHE_TTL_MS`.
El servidor **no arranca** sin `JWT_SECRET` y `DATABASE_URL` (y en producción exige `JWT_SECRET` de 32+ caracteres).

Crear cuentas municipales (ya no se pueden registrar por la API pública):

    node scripts/crear-usuario-municipal.js --rol OPERADOR_MUNICIPAL --nombre "Ana Pérez" \
      --rut 12345678-5 --email ana@muni.cl --password "clave-segura-123" --comuna "Santiago Centro"

---

## 1. Registro de empresa

### `POST /auth/registrar-empresa` — público (límite de intentos por IP)
Crea la empresa y su primer usuario **LOGISTICA** (administrador) en una sola operación.

```json
{
  "empresa": {
    "rut": "76.086.428-5", "razon_social": "Constructora Andes SpA", "giro": "Construcción",
    "nombre_fantasia": "Andes", "direccion": "Av. Libertador 1234", "comuna": "Santiago",
    "region": "Metropolitana", "email_contacto": "contacto@andes.cl", "telefono": "+56912345678",
    "representante_legal": { "nombre": "María Soto", "rut": "12345678-5" }
  },
  "usuario": { "nombre": "Pedro Admin", "rut": "11111111-1", "email": "pedro@andes.cl", "password": "clave-segura-123" }
}
```
**201** → `{ "empresa": { "id", "rut", "razon_social", "nombre_fantasia" }, "usuario": { "id", "rol": "LOGISTICA", ... }, "token" }`
**400** RUT inválido (empresa, representante o usuario), campo faltante, contraseña < 8 caracteres · **409** RUT de empresa o email ya registrados.
Los RUT se guardan normalizados (`12345678-5`) y los emails en minúsculas.

### `POST /auth/registrar` — público
Solo `CHOFER` / `LOGISTICA` **dentro de una empresa existente** (`empresa_id` obligatorio).
**403** si pide un rol municipal · **400** si pide `tipo_persona: "NATURAL"` (solo se registran empresas).
### `POST /auth/login` — el email no distingue mayúsculas.
### `GET /auth/me` — ahora incluye `empresa: { id, rut, razon_social, nombre_fantasia }` (o `null` en cuentas municipales).

---

## 2. Nómina de trabajadores (`/trabajadores`)
Solo **LOGISTICA** crea / edita / da de baja / importa. **CHOFER** solo consulta. Siempre acotado a la empresa del usuario.
Trabajador: `{ id, rut, nombre, cargo, contrato_vigente_hasta, epp_vigente_hasta, activo }` (fechas `AAAA-MM-DD`).

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/trabajadores?q=&activo=&limit=&cursor=` | `q` busca por nombre o RUT. `activo`: omitido/`true` activos, `false` bajas, `todos`. Respuesta `{ items, next_cursor }` |
| GET | `/trabajadores/:id` | detalle (404 si es de otra empresa) |
| POST | `/trabajadores` | alta (RUT validado; 409 si ya está en la nómina) |
| PATCH | `/trabajadores/:id` | cambia solo los campos enviados (también `activo: true` para reactivar) |
| DELETE | `/trabajadores/:id` | **baja lógica** (`activo = false`) |
| POST | `/trabajadores/importar` | JSON `{ "trabajadores": [...] }`, o `{ "csv": "..." }`, o cuerpo `text/csv` (cabecera `rut,nombre,cargo,contrato_vigente_hasta,epp_vigente_hasta`, separador `,` o `;`; máx. 500 filas) |

Importación → `{ "creados": 12, "actualizados": 3, "errores": [ { "fila": 4, "motivo": "El RUT del trabajador no es válido" } ] }`
(`fila` = posición de la fila de datos; las válidas se guardan aunque otras fallen).

## 3. Vehículos (`/vehiculos`)
- `GET /vehiculos?q=&limit=&cursor=` — solo activos. `q` busca por patente. **Sin `limit` devuelve todos como array (igual que antes)**; con `limit` pagina y el siguiente cursor viene en el header `X-Next-Cursor`.
- `PATCH /vehiculos/:id` (solo LOGISTICA) — `patente`, `alto_m`, `ancho_m`, `largo_m`, `peso_ton`, `activo`. 404 si es de otra empresa, 409 patente repetida.
- `DELETE /vehiculos/:id` (solo LOGISTICA) — baja lógica.

## 4. Crear solicitud — `POST /permisos` (cambios)
Campos nuevos opcionales: `trabajadores_ids: [uuid]` (de la nómina de **su** empresa), `vehiculos_ids: [uuid]`, `vehiculo_id`, y `personal: [{ rut, nombre, cargo, contrato_vigente, epp_al_dia }]` (compatibilidad).
- Todo ocurre en **una transacción**: si algo falla no queda un permiso a medias.
- **403** si algún vehículo o trabajador no pertenece a su empresa (o está de baja). **400** ante ventana/ids inválidos.
- Los trabajadores se copian a `personal_faena` como foto del momento (rut, nombre, cargo, vigencias).
- No bloquea por contrato/EPP vencido: responde `advertencias: [{ "tipo": "CONTRATO_VENCIDO" | "EPP_VENCIDO", "rut", "nombre" }]` (también en `GET /permisos/:id`).
- Evalúa el riesgo con la **fecha y hora locales de Chile** (`hora_inicio`, activa el peso nocturno). Si el servicio de riesgo está caído el permiso se crea igual con `riesgo: null` y `riesgo_pendiente: true`.

## 5. Panel de la empresa (`/empresa`) — LOGISTICA y CHOFER con cuenta de empresa

### `GET /empresa/solicitudes` — todas las solicitudes de la empresa (no solo las del usuario)
Query: `q` (patente, RUT ejecutor o código corto del id), `desde`/`hasta` (sobre la **fecha de inicio** del servicio), `con_multas=true|false`, `orden=asc|desc`, `limit` (25; máx. 100), `cursor`, y `grupo`:

| `grupo` | Significa |
|---|---|
| `pendiente` | esperando aprobación municipal (incluye en cola de espera) |
| `aprobada_futura` | aprobada y aún no parte |
| `en_curso` | activa / en operativo |
| `terminada` | finalizada o expirada |
| `rechazada` | rechazada |
| `en_revision` / `por_aplazar` | la municipalidad pidió cambiar horario o datos |
| *(cualquier estado exacto)* | p. ej. `SUSPENDIDO`, `REVOCADO` |

```json
{ "items": [ { "id", "patente", "estado", "tipo_actividad", "rut_ejecutor", "ventana_inicio", "ventana_fin",
               "created_at", "riesgo": "Alto", "score_riesgo": 81, "n_multas": 2, "tiene_multas": true } ],
  "next_cursor": "eyJj..." }
```
Scroll infinito: pasar `next_cursor` como `cursor`; llega `null` en la última página.
### `GET /empresa/solicitudes/:id/multas` — multas con detalle (404 si es de otra empresa)
### `GET /empresa/resumen`
```json
{ "empresa": { "razon_social", "nombre_fantasia" },
  "contadores": { "por_estado": { "APROBADO": 3 }, "multas_pendientes": 4, "trabajadores_activos": 12, "vehiculos_activos": 5 },
  "alertas": { "contratos_por_vencer": 2, "epp_por_vencer": 1, "multas_pendientes": 4 } }
```
`por_vencer` = próximos 30 días. *Aún no existe un estado de pago/validación de multas: `multas_pendientes` cuenta todas las multas registradas.*
### `GET /empresa/estadisticas?desde=&hasta=&agrupar=mes|semana` (defecto: 180 días, mes; máx. 1 año)
```json
{ "rango": { "desde", "hasta", "agrupar": "mes" },
  "por_periodo": [ { "periodo": "2026-09-01", "total": 5, "aprobadas": 4, "rechazadas": 1, "finalizadas": 3 } ],
  "por_estado": [ { "estado": "FINALIZADO", "total": 3 } ],
  "por_riesgo": [ { "nivel": "Alto", "total": 1 } ],
  "multas_por_periodo": [ { "periodo": "2026-09-01", "total": 2 } ],
  "tiempo_promedio_aprobacion_horas": 3.5 }
```

## 6. Aplazar horario (estado `EN_REVISION`)
- `PATCH /permisos/:id/solicitar-revision` *(municipal)* — `{ "motivo": "...", "ventana_propuesta": { "inicio": ISO, "fin": ISO } }` (la propuesta es opcional). Solo sobre una solicitud pendiente o aprobada **a futuro** (409 si no). Queda en la bitácora y emite **`solicitud:en_revision`**.
- `PATCH /permisos/:id/corregir` *(empresa)* — `{ ventana_inicio, ventana_fin, altura_estimada_m?, rut_ejecutor?, vehiculo_id? }` (todo opcional; las fechas van juntas). Solo en `EN_REVISION`, por quien la creó o un LOGISTICA de su empresa. Vuelve a `PENDIENTE_CONFIRMACION_MUNICIPAL` y emite **`solicitud:corregida`**. **409** si el nuevo horario se solapa con otra solicitud.
- `PATCH /permisos/:id/aprobar` — acepta `{ "comentario": "..." }`: queda en la línea de tiempo.
- Una solicitud pendiente, en cola o en revisión cuya ventana ya terminó pasa sola a `EXPIRADO` (job 012).

## 7. Riesgo (Santiago Centro)
- El permiso evaluado trae en `GET /permisos/:id`: `riesgo: { nivel, score, explicacion, comuna_detectada, fuente_congestion, calles_afectadas }` y `riesgo_pendiente`. En el listado `riesgo` sigue siendo el texto (`"Alto"`) y se agrega `patente`, `score_riesgo` y `riesgo_pendiente`.
- `PATCH /permisos/:id/reevaluar-riesgo` *(municipal)* — reintenta la evaluación; **503** si el servicio sigue caído.
- **Proxy** *(municipal; los frontends NO llaman al servicio de Python)*, con caché en memoria de 5 min:
  - `GET /riesgo/calles?comuna=SANTIAGO&metrica=riesgo|congestion&hora=18&bbox=&formato=geojson` (por defecto `comuna=SANTIAGO`, `formato=geojson`). Respuesta idéntica a la del servicio. Header `X-Cache: HIT|MISS`.
  - `GET /riesgo/zonas-rojas`
  - **503** `{ "error": "El servicio de riesgo no está disponible..." }` si no responde (los errores no se cachean).

## 8. Eventos Socket.io (`solicitud:*`)
Conectar con `auth: { token }`. Cada evento se entrega **una sola vez** a quien corresponda: operadores de la comuna (`comuna:<id>`), el dueño (`usuario:<id>`), **toda la empresa** (`empresa:<id>`) y la sesión de código de chofer de ese servicio (`permiso:<id>`).

`solicitud:nueva` · `solicitud:aprobada` · `solicitud:rechazada` · `solicitud:revocada` · `solicitud:suspendida` · `solicitud:en_revision` · `solicitud:corregida`
Payload: el permiso (`id`, `estado`, `comuna_id`, `usuario_id`, `empresa_id`, …) más `motivo` / `ventana_propuesta` cuando corresponde.

## 9. Seguridad (comportamiento nuevo)
- Login y registro: límite de intentos por IP → **429** con header `Retry-After`. Detrás de Render el servidor usa la IP real (`trust proxy`).
- Errores sin detalle interno: `23505 → 409 "Ya existe un registro con esos datos"`, `23P01 → 409 "El área y el horario se solapan..."`, cuerpo > 1 MB → **413**, JSON inválido → 400, cualquier otro → 500 genérico.
- Cabeceras de seguridad (`helmet`). CORS limitado a `CORS_ORIGINS` si está definida; las cabeceras `X-Next-Cursor`, `X-Cache`, `Retry-After` quedan visibles para el navegador.
- Los tokens de QR y de código de chofer ya no sirven como sesión normal (401); solo los endpoints de código de chofer los aceptan.
- Los JWT se verifican solo con `HS256`.
