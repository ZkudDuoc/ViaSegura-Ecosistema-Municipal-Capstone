# Dashboard Web — Módulo 1b

Responsable: Agustin Cavieres

## Alcance (ver plan completo en `../docs/ViaSegura-Plan-Proyecto.md`)
Dashboard web (React.js + MapLibre GL): bandeja de decisiones (Operador Central) y reportería de solo lectura (Supervisor).

## Setup

```bash
npm install
cp .env.example .env   # completar VITE_API_BASE_URL si el backend no corre en localhost:3000
npm run dev
```

Requiere el Backend (`../backend`) corriendo con login habilitado — el
dashboard pide credenciales antes de mostrar cualquier panel.

## Semana 1 — Tareas
- Estructura de navegación por rol (Operador, Supervisor).
- Integración inicial de MapLibre GL con tiles OSM.
- Mockups de dashboard.

## Semana 2 — Tareas
- Login contra `POST /api/auth/login` (`src/context/AuthContext.jsx`).
- `OperadorPage` conectado a `GET /api/permisos` (`src/services/permisoService.js`);
  ese endpoint todavía no existe en el Backend — el panel lo muestra como
  pendiente en vez de romperse. Ver `../docs/DEMO-Semana2.md`.
- `SupervisorPage` sigue con datos mock — conexión real es tarea de Semana 3
  según el plan.

Rama de trabajo: `agustin-frontend` (compartida con `app-movil/`).
