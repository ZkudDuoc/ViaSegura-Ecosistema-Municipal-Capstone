"""Smoke test E2E del microservicio de riesgo — local o desplegado.

Solo usa la biblioteca estándar (no hay que instalar nada), así corre igual
en tu PC que contra la URL de Render. Simula el flujo de la demo: arma el
polígono como lo hace el frontend al presionar "iniciar trabajo" (ruta +
5.5 m a cada lado), consulta POST /score como lo hace el Backend, y
verifica el resultado esperado de cada nivel, el rechazo de datos
inválidos, las zonas rojas y la latencia.

Uso:
    python scripts/smoke_test.py                              # 127.0.0.1:8000
    python scripts/smoke_test.py --url https://viasegura-riesgo.onrender.com

Los escenarios están fijados a la fecha 2026-10-15 con el dataset simulado
del repo (ver scripts/generar_escenarios_demo.py). Devuelve código de
salida 1 si algo falla.
"""

import argparse
import json
import math
import statistics
import sys
import time
import urllib.error
import urllib.request

METROS_POR_GRADO_LAT = 111_320
METROS_POR_GRADO_LON = 92_800
BUFFER_RUTA_M = 5.5  # ancho del camión 2.5 m + conos 3 m, a cada lado
FECHA = "2026-10-15"

# nombre: (lat, lon, nivel, incidentes, risk_score) — ruta de 150 m E-O
ESCENARIOS = {
    "riesgo bajo": (-33.421799, -70.695054, "bajo", 1, 32.97),
    "riesgo medio": (-33.403018, -70.643878, "medio", 1, 55.07),
    "riesgo alto": (-33.460763, -70.667891, "alto", 2, 86.47),
    "sin incidentes": (-33.4105, -70.6905, "bajo", 0, 0.0),
}


def poligono_ruta_este_oeste(lat, lon, largo_m, buffer_m=BUFFER_RUTA_M):
    """Mismo rectángulo que arma el frontend: ruta de `largo_m` centrada en
    (lat, lon) más `buffer_m` a cada lado y en los extremos (conos)."""
    mitad_x = (largo_m / 2 + buffer_m) / METROS_POR_GRADO_LON
    mitad_y = buffer_m / METROS_POR_GRADO_LAT
    anillo = [
        [lon - mitad_x, lat - mitad_y],
        [lon + mitad_x, lat - mitad_y],
        [lon + mitad_x, lat + mitad_y],
        [lon - mitad_x, lat + mitad_y],
        [lon - mitad_x, lat - mitad_y],
    ]
    return {"type": "Polygon", "coordinates": [anillo]}


def llamar(base, ruta, cuerpo=None, timeout=60):
    """(status, json, milisegundos). Un 4xx/5xx NO lanza excepción."""
    data = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(
        base + ruta, data=data, headers={"Content-Type": "application/json"},
        method="POST" if cuerpo is not None else "GET",
    )
    inicio = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, texto = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, texto = e.code, e.read()
    return status, json.loads(texto or b"null"), (time.perf_counter() - inicio) * 1000


class Resultado:
    def __init__(self):
        self.fallos = 0

    def check(self, ok, descripcion, detalle=""):
        print(f"  [{'OK' if ok else 'FALLA'}] {descripcion}" + (f"  -> {detalle}" if detalle else ""))
        self.fallos += not ok


def main():
    parser = argparse.ArgumentParser()
    # 127.0.0.1 y no "localhost": en Windows "localhost" intenta primero IPv6
    # (::1), uvicorn escucha solo en IPv4 y cada conexión pierde ~2 s
    # esperando el fallback (medido: 2050 ms vs 3 ms por consulta).
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--max-p95-ms", type=float, default=1500,
                        help="p95 máximo aceptado (subir si el servicio despierta de un sleep)")
    args = parser.parse_args()
    base = args.url.rstrip("/")
    res = Resultado()

    print(f"Smoke test contra {base}\n")

    print("1. /health (la primera llamada puede tardar si el servicio estaba dormido)")
    status, cuerpo, ms = llamar(base, "/health")
    res.check(status == 200 and cuerpo["status"] == "ok", "responde ok", f"{ms:.0f} ms")
    if status == 200:
        res.check(cuerpo["datasets"]["incidentes"] > 0 and cuerpo["datasets"]["manzanas_censales"] > 0,
                  "datasets cargados", str(cuerpo["datasets"]))

    print(f"\n2. Flujo 'iniciar trabajo' -> polígono auto-calculado -> /score (fecha {FECHA})")
    for nombre, (lat, lon, nivel, n, score) in ESCENARIOS.items():
        cuerpo_req = {"poligono": poligono_ruta_este_oeste(lat, lon, 150),
                      "fecha": FECHA, "tipo_actividad": "PROGRAMADA"}
        status, r, ms = llamar(base, "/score", cuerpo_req)
        ok = (status == 200 and r["nivel"] == nivel and r["n_incidentes_considerados"] == n
              and math.isclose(r["risk_score"], score, abs_tol=0.01))
        res.check(ok, f"{nombre}: nivel={nivel}, incidentes={n}, score={score}",
                  f"obtenido nivel={r.get('nivel')} n={r.get('n_incidentes_considerados')} "
                  f"score={r.get('risk_score')} ({ms:.0f} ms)" if status == 200 else f"HTTP {status}")

    print("\n3. Validaciones")
    malo = {"poligono": poligono_ruta_este_oeste(-33.42, -70.64, 150), "fecha": FECHA, "tipo_actividad": "urgente"}
    res.check(llamar(base, "/score", malo)[0] == 422, "tipo_actividad fuera de PROGRAMADA/EMERGENCIA -> 422")
    roto = {"poligono": {"type": "Polygon", "coordinates": [[[0, 0], [1, 1]]]}, "fecha": FECHA, "tipo_actividad": "PROGRAMADA"}
    res.check(llamar(base, "/score", roto)[0] == 400, "polígono inválido -> 400")

    print("\n4. /zonas-rojas")
    status, z, _ = llamar(base, "/zonas-rojas")
    res.check(status == 200 and z["total_clusters"] > 0, "devuelve clusters", f"{z.get('total_clusters')} zonas")

    print("\n5. Latencia (30 consultas /score seguidas, el Backend espera < 5 s)")
    cuerpo_req = {"poligono": poligono_ruta_este_oeste(-33.460763, -70.667891, 150),
                  "fecha": FECHA, "tipo_actividad": "PROGRAMADA"}
    tiempos = sorted(llamar(base, "/score", cuerpo_req)[2] for _ in range(30))
    p50, p95 = statistics.median(tiempos), tiempos[int(len(tiempos) * 0.95) - 1]
    print(f"  p50={p50:.0f} ms  p95={p95:.0f} ms  max={tiempos[-1]:.0f} ms")
    res.check(p95 < args.max_p95_ms, f"p95 < {args.max_p95_ms:.0f} ms")

    print(f"\n{'TODO OK' if not res.fallos else str(res.fallos) + ' CHEQUEO(S) FALLARON'}")
    sys.exit(1 if res.fallos else 0)


if __name__ == "__main__":
    main()
