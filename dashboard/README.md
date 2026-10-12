# Dashboard municipal — Módulo 1 (Frontend)

Responsable: Agustin Cavieres

Panel web para el **Operador municipal** de Santiago Centro: recibe las solicitudes de las empresas,
ve su riesgo y decide; sigue los servicios en terreno y las alertas de pánico; revisa multas y reportería.

## Pantallas
- **Bandeja de decisiones** (`/operador`): solicitudes en vivo (Socket.io), filtros y prioridad, mapa con
  los servicios activos y la capa de **calles de Santiago Centro por riesgo o congestión** (con leyenda y hora del día).
- **Detalle de solicitud** (`/solicitudes/:id`): riesgo explicado (comuna, calles afectadas), personal,
  vehículos, multas, línea de tiempo; aprobar con comentario, rechazar, revocar y descargar la resolución en PDF.
- **Alertas de pánico**: aparecen en cualquier pantalla, con sonido y foco en el mapa.
- **Multas** (`/multas`) y **Reportería** (`/reporteria`): números en lenguaje simple, comparación y descarga Excel/PDF.

## Requisitos
- Backend (`../backend`) corriendo. El dashboard **no** llama al servicio de riesgo directamente: las calles
  y el riesgo pasan por el Backend (`/api/riesgo/*`), que a su vez consulta `../servicio-riesgo`.
- Una cuenta con rol `OPERADOR_MUNICIPAL` (se crean con `backend/scripts/crear-usuario-municipal.js`).

## Configuración
| Variable | Para qué | Por defecto |
|---|---|---|
| `VITE_API_BASE_URL` | URL de la API del Backend (termina en `/api`) | `http://localhost:3000/api` |

```bash
npm install
cp .env.example .env     # en Windows: copy .env.example .env
npm run dev              # http://localhost:5173
```

## Producción
```bash
# .env.production con la URL del Backend desplegado, por ejemplo:
# VITE_API_BASE_URL=https://viasegura-backend.onrender.com/api
npm run build            # genera dist/
npm run preview          # prueba local del build
```
`dist/` se publica como sitio estático. Como es una SPA, el hosting debe redirigir todas las rutas a
`index.html` (en Render: *Rewrite* `/*` → `/index.html`). La URL del dashboard debe estar en
`CORS_ORIGINS` del Backend.