# Ficha para el front — cambios recientes del backend

Detalle completo del resto de endpoints: `docs/API-Semana6.md`.

## 1. Código de chofer (cambio de formato)

- `POST /api/codigo-chofer/...` (generar) devuelve `{ id, codigo, expira_at }`.
- **Nuevo formato**: 6 caracteres, 4 letras + 2 números, ej. `KMTR47`. Sin `I` ni `O`.
- Un solo uso, vence a las 24 h.
- El canje acepta minúsculas y espacios (`" kmtr 47 "` → `KMTR47`), pero el front ya lo normaliza.
- Front: input en mayúsculas, `maxLength={6}`, placeholder `Ej: KMTR47`.
- Error de canje: `Código inválido, ya utilizado o expirado`. Límite de intentos: 8 por 15 min por IP (429 + `Retry-After`).

## 2. Finalizar servicio

`PATCH /api/permisos/:id/finalizar`

- Lo puede usar CHOFER/LOGISTICA dueño, o la sesión por código (solo su permiso).
- 409 si el estado no es válido.

## 3. Límite de comuna

- `GET /api/comunas` → incluye `habilitada` (bool) y `limite` (GeoJSON MultiPolygon, puede ser null).
- Crear solicitud (`POST /api/permisos`) puede responder 422:
  - `COMUNA_NO_HABILITADA`
  - `AREA_FUERA_DE_COMUNA`
- Hoy solo **Santiago Centro** está habilitada.

## 4. QR dinámico (TOTP)

- `GET /api/permisos/:id/qr-secreto` → secreto + parámetros: periodo 30 s, 8 dígitos, SHA-256, `servidor_ahora`.
- Contenido del QR: `VS1.<permisoId>.<codigo>`. El chofer lo regenera en el dispositivo (funciona sin conexión).
- Supervisor: `POST /api/permisos/verificar-qr` (acepta QR `VS1` y el legacy). 400 `QR inválido o expirado`.

## 5. Panel de cumplimiento (empresa)

`GET /api/empresa/cumplimiento` (LOGISTICA)

```json
{
  "trabajadores": { "vencidos": [], "por_vencer": [] },
  "multas": { "total": 0, "ultimos_30_dias": 0, "recientes": [] },
  "solicitudes": { "total": 0, "aprobadas": 0, "rechazadas": 0, "tasa_aprobacion": 0 },
  "tiempo_promedio_aprobacion_horas": null
}
```

- `vencidos`: contrato o EPP anterior a hoy. `por_vencer`: dentro de 30 días.
- `tasa_aprobacion`: 0–100 con un decimal.

## 6. Validar ubicación al iniciar (opcional)

`PATCH /api/permisos/:id/activar` con `{ foto_evidencia_url, ubicacion: { lat, lng } }`

- Solo si el servidor tiene `VALIDAR_UBICACION=true` (por defecto apagado para la demo).
- 400 `UBICACION_REQUERIDA` (falta o fuera de rango), 422 `FUERA_DE_AREA` (más de 50 m del área).
- La ubicación no se guarda.

## 7. Para desplegar (lo hace Joshua)

- Migraciones en Supabase: 010 → 011 (sola) → 012 → 013 → 014.
- Variables en Render: `CORS_ORIGINS`, opcional `VALIDAR_UBICACION`.
