# Backend Core — Módulo 2

Responsable: Joshua Cruz

## Alcance (ver plan completo en `../docs/ViaSegura-Plan-Proyecto.md`)
API RESTful, ciclo de vida del permiso, RBAC/JWT, WebSocket (Socket.io) para el botón de pánico, PostgreSQL/PostGIS, integración HTTP con `servicio-riesgo`.

## Setup

```bash
npm install
cp .env.example .env   # completar DATABASE_URL, JWT_SECRET, RISK_SERVICE_URL
npm run migrate        # aplica migraciones/*.sql contra DATABASE_URL (requiere proyecto Supabase con PostGIS)
npm run seed           # crea comuna/empresa/usuarios de prueba (password: Password123!)
npm run dev
```

Verificar que el servidor responde en `http://localhost:3000/health`.

## Esquema (migrations/)
- `001_extensions.sql` — habilita `postgis` y `pgcrypto`.
- `002_comuna.sql`, `003_empresa.sql`, `004_rol.sql`, `005_usuario.sql` — entidades base.
- `006_permiso.sql` — ciclo de vida del permiso, columna `poligono geometry(Polygon,4326)` + índice GIST.

Runner propio en `scripts/migrate.js` (tabla `schema_migrations` para llevar el control de lo aplicado).

## RBAC/JWT
- `POST /api/auth/login` — valida email/password (bcrypt) y devuelve JWT (`sub`, `rol`, `empresa_id`).
- `GET /api/auth/me` — requiere `Authorization: Bearer <token>`.
- `src/middleware/auth.js` — `authenticate` (verifica JWT) y `requireRole(...roles)` para proteger rutas por rol.

## Semana 1 — Tareas
- Conectar PostgreSQL/PostGIS (Supabase). — *pendiente: crear proyecto y setear `DATABASE_URL` en `.env`*
- Migraciones del esquema completo (COMUNA, EMPRESA, USUARIO, PERMISO, etc.). — hecho
- RBAC/JWT base. — hecho

Rama de trabajo: `joshua-backend`.
