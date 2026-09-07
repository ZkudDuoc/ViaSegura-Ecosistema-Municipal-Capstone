# App Móvil — Módulo 1a

Responsable: Agustin Cavieres

## Alcance (ver plan completo en `../docs/ViaSegura-Plan-Proyecto.md`)
App móvil (React Native + Expo): registro de solicitud con polígono GeoJSON, geofencing + foto, botón de pánico, escaneo QR e infracciones (Inspector).

## Setup

```bash
npm install
npm start   # abre Expo, escanear QR con Expo Go o correr en emulador
```

**IMPORTANTE (desde Semana 2):** la app usa `react-native-maps` (para el polígono
de la solicitud), que requiere código nativo y **no funciona en la app Expo Go**.
Hay que generar un *development build*:

```bash
npx expo install expo-dev-client
npx expo run:android   # o: npx expo run:ios (requiere Xcode en Mac)
```

Además, para que el mapa cargue en Android hay que reemplazar
`REEMPLAZAR_CON_API_KEY_DE_GOOGLE_MAPS` en `app.json` por una API key real de
Google Maps (Google Cloud Console → Maps SDK for Android). En iOS no hace falta
key (usa Apple Maps).

Antes de correr la app, configurar `src/config.js` con la IP del backend en tu
red local (no `localhost`, porque en un dispositivo físico o emulador eso
apunta al propio dispositivo, no a tu PC).

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
