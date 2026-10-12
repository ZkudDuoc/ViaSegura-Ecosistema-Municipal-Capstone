# App del Supervisor — Módulo 1 (Frontend)

Responsable: Agustin Cavieres

PWA para el **supervisor municipal en terreno** (instalable en el celular).

## Qué hace
- **Escanear** el QR firmado que muestra el chofer (o buscar por código de 8 caracteres) y ver si el permiso está vigente.
- **Ficha del permiso**: empresa, personal, vehículos e inspecciones anteriores; **validar la patente**.
- **Inspección en terreno**: checklist de 4 puntos (señalética, EPP, operarios, patentes) con resultado
  conforme / no conforme / suspender la obra.
- **Multas**: cursar una infracción con foto y ver las ya cursadas.
- **Revisados recientemente**: volver a un permiso sin escanear de nuevo.

## Requisitos
Backend (`../backend`) corriendo y una cuenta con rol `INSPECTOR_MUNICIPAL`
(se crean con `backend/scripts/crear-usuario-municipal.js`).

## Configuración
| Variable | Para qué | Por defecto |
|---|---|---|
| `VITE_API_BASE_URL` | URL de la API del Backend (termina en `/api`) | `http://localhost:3000/api` |

```bash
npm install
cp .env.example .env     # en Windows: copy .env.example .env
npm run dev              # http://127.0.0.1:5175
npm run generar-iconos   # solo si cambia public/logo.png
```
En un celular por USB: `adb reverse tcp:5175 tcp:5175` y `adb reverse tcp:3000 tcp:3000`.

## Producción
```bash
# .env.production: VITE_API_BASE_URL=https://<backend-desplegado>/api
npm run build            # genera dist/
```
Publicar `dist/` como sitio estático con redirección de rutas a `index.html`. La **cámara** (escáner QR)
solo funciona con **HTTPS**. Agregar la URL a `CORS_ORIGINS` del Backend.