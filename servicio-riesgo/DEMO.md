# Guía de demo — Módulo 3 (riesgo) dentro del flujo integrado

Flujo que se muestra: el chofer presiona **"iniciar trabajo"** → el frontend
calcula el polígono (GPS del camión + ancho 2.5 m + conos 3 m ≈ 5.5 m por
lado) → el Backend consulta `POST /score` → el nivel **bajo / medio / alto**
decide lo que ve el Operador en el dashboard.

## 1. Cuatro escenarios reales (para la fecha de la demo)

Camión detenido en una ruta de 150 m este-oeste centrada en cada punto GPS,
fecha `2026-10-15`, `tipo_actividad: PROGRAMADA`. Agustín puede simular esa
posición GPS en el frontend; el resultado esperado es:

| Escenario | GPS del camión (lat, lon) | risk_score | nivel | Incidentes cercanos |
|---|---|---|---|---|
| Sin riesgo | -33.4105, -70.6905 | 0.0 | **bajo** | 0 |
| Riesgo bajo | -33.421799, -70.695054 | 32.97 | **bajo** | 1 (leve) |
| Riesgo medio | -33.403018, -70.643878 | 55.07 | **medio** | 1 (media) |
| Riesgo alto | -33.460763, -70.667891 | 86.47 | **alto** | 2 |

Si la demo es otro día, la época del año cambia qué incidentes entran en la
ventana (±45 días). Regenera los escenarios para esa fecha:

```bash
python scripts/generar_escenarios_demo.py --fecha 2026-11-05
```

Imprime, por nivel, el punto GPS y el cuerpo JSON listo para pegar.

## 2. Antes de la demo (checklist, 10 minutos antes)

- [ ] Servicio arriba: `python scripts/smoke_test.py` (local) o
      `python scripts/smoke_test.py --url https://TU-SERVICIO.onrender.com`
      debe terminar en `TODO OK`. (Si el servicio está en el plan gratis y
      estaba dormido, la primera llamada tarda ~1 min: ese es el motivo de
      correrlo antes. Ver `DEPLOY.md`.)
- [ ] Backend apuntando al servicio: `RISK_SERVICE_URL` = URL de Render, o
      `http://127.0.0.1:8000` en local (**no** `localhost`: en Windows suma
      ~2 s por consulta).
- [ ] Fecha del sistema correcta (la fecha de "iniciar trabajo" es la que
      se consulta).

## 3. Qué decir (guion corto)

1. "El polígono ya no lo dibuja el chofer: se calcula solo a partir de la
   posición del camión y las medidas reglamentarias." (Anexo A del plan)
2. "Nuestro módulo recibe ese polígono angosto y cruza la zona con el
   historial de incidentes de la misma época del año, ponderando por
   gravedad, y con la densidad poblacional del sector."
3. "Como el polígono es tan angosto (11 m), se busca con un margen de 75 m
   alrededor; medimos que sin margen solo el 0.4% de las solicitudes
   tocaban algún incidente, y con 75 m el 8.8%."
4. "Responde en ~15 ms, así que 'iniciar trabajo' no se siente lento."
5. Mostrar los 3 niveles con los puntos de la tabla y `GET /zonas-rojas`
   (27 zonas normalizadas por densidad poblacional) para el mapa.

## 4. Si algo falla en vivo

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El permiso queda sin evaluación de riesgo | El servicio estaba dormido (plan gratis) y el Backend expiró a los 5 s | Abrir `/health`, esperar a que responda, reintentar |
| Todo sale "bajo" con score 0 | Fecha fuera de los datos, o el punto GPS no está en el área con datos (lat -33.50 a -33.40, lon -70.70 a -70.60) | Usar los puntos de la tabla |
| Cada consulta tarda ~2 s (local, Windows) | `localhost` resuelve IPv6 primero | Usar `127.0.0.1` |
| 422 en `/score` | `tipo_actividad` distinto de `PROGRAMADA` / `EMERGENCIA` | Corregir el valor |
| Plan B si Render cae | — | Servicio local: `uvicorn app.main:app --port 8000` y `RISK_SERVICE_URL=http://127.0.0.1:8000` |
