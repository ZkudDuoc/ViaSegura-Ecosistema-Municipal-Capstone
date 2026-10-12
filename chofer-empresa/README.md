# Web Empresa y Chofer — Módulo 1 (Frontend)

Responsable: Agustin Cavieres

Web responsive e instalable (PWA) para las **empresas de transporte** y sus **choferes**.

## Empresa (cuenta con email y contraseña)
- **Registro de empresa** en 3 pasos (empresa → representante legal → administrador), solo empresas.
- **Inicio**: bienvenida, accesos rápidos con contadores y avisos (contratos/EPP por vencer, multas, horarios por corregir).
- **Solicitudes**: historial de toda la empresa con gráficos, búsqueda, filtros por estado/fecha/multas,
  detalle con multas, PDF, código para el chofer y **"Corregir horario"** cuando la municipalidad lo pide.
- **Crear solicitud**: dirección con autocompletado y pin, área calculada con las medidas del camión,
  personal elegido desde la nómina (avisa contrato/EPP vencido sin bloquear) y maquinaria adicional.
- **Camiones** y **Trabajadores**: búsqueda, alta, edición, baja/reactivación e importación de nómina desde CSV.

## Chofer (sin cuenta)
Entra en **"¿Eres chofer?"** con el código que le envía la empresa: ve su servicio, muestra el QR firmado,
inicia el trabajo con GPS + foto y tiene el **botón de pánico** (mantener presionado 2 segundos).

## Configuración
| Variable | Para qué | Por defecto |
|---|---|---|
| `VITE_API_BASE_URL` | URL de la API del Backend (termina en `/api`) | `http://localhost:3000/api` |

```bash
npm install
cp .env.example .env     # en Windows: copy .env.example .env
npm run dev              # http://127.0.0.1:5174
npm test                 # pruebas con Vitest (registro y crear solicitud)
```
Para probar en un celular por USB: `adb reverse tcp:5174 tcp:5174` y `adb reverse tcp:3000 tcp:3000`.

## Producción
```bash
# .env.production: VITE_API_BASE_URL=https://<backend-desplegado>/api
npm run build            # genera dist/ (incluye el service worker de la PWA)
```
Publicar `dist/` como sitio estático con redirección de todas las rutas a `index.html`, y agregar su URL a
`CORS_ORIGINS` del Backend. La cámara y el GPS solo funcionan con **HTTPS** (o localhost).