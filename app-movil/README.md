# App Móvil — Módulo 1a

Responsable: Agustin Cavieres

## Alcance (ver plan completo en `../docs/ViaSegura-Plan-Proyecto.md`)
App móvil (React Native + Expo): registro de solicitud con polígono GeoJSON, geofencing + foto, botón de pánico, escaneo QR e infracciones (Inspector).

## Setup

```bash
npm install
npm start   # abre Expo, escanear QR con Expo Go o correr en emulador
```

Antes de correr la app, configurar `src/config.js` con la IP del backend en tu
red local (no `localhost`, porque en un dispositivo físico o emulador eso
apunta al propio dispositivo, no a tu PC).

El mapa del formulario de solicitud (`src/components/PolygonMapPicker.js`) es
un `WebView` con MapLibre GL JS (mismo tile de OSM que usa el dashboard) — sin
librerías de mapas nativas, sin API key de Google, y funciona en Expo Go.
Requiere conexión a internet en el dispositivo para cargar los tiles.

## Semana 1 — Tareas
- Estructura de navegación por rol (Chofer/Logística, Inspector).
- Mockups de pantalla de solicitud.

## Semana 2 — Tareas
- Login/registro contra `POST /api/auth/login` y `/api/auth/registrar`.
- Formulario de solicitud: polígono dibujado en mapa, tipo de actividad, altura
  estimada, ventana de fechas → `POST /api/permisos`.
- Pantalla de geofencing + foto → `PATCH /api/permisos/:id/activar`.
- Botón de pánico por WebSocket (Socket.io) — eventos `panico:enviar` /
  `panico:confirmado` / `panico:error` (ver `src/services/panicoSocket.js`;
  falta que el Backend implemente el listener del lado servidor).

Rama de trabajo: `agustin-frontend` (compartida con `dashboard/`).
