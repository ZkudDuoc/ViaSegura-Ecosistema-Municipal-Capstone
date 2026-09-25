"""Semana 4: valida /score con polígonos angostos de ruta auto-calculada.

Reproduce el polígono que arma el frontend al presionar "iniciar trabajo"
(ruta + ~5.5 m a cada lado, ver tests/poligonos_ruta.py) y mide:
  1. cuántas solicitudes encuentran incidentes según el largo de la ruta;
  2. monotonía: una ruta más larga que CONTIENE a otra nunca debería dar
     menos riesgo que la corta (se evalúa con pares 1900 m vs 2200 m).

Uso:
    python scripts/probar_poligonos_ruta.py
"""

import sys
from datetime import date
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from shapely.geometry import shape

from app import config
from app.data.censo import cargar_censo, generar_censo_simulado
from app.data.incidents import as_geodataframe, cargar_incidentes, generar_incidentes_simulados
from app.services import scoring
from tests.poligonos_ruta import poligono_desde_ruta_recta

FECHA = date(2025, 4, 15)
LARGOS_M = [20, 50, 100, 300, 1000, 2000, 2500, 5000]
N_POR_LARGO = 400
N_PARES = 1500


def main():
    generar_incidentes_simulados(config.INCIDENTS_DATASET_PATH)
    generar_censo_simulado(config.INE_CENSUS_DATA_PATH)
    gdf_incidentes = as_geodataframe(cargar_incidentes(config.INCIDENTS_DATASET_PATH))
    gdf_censo = cargar_censo(config.INE_CENSUS_DATA_PATH)

    rng = np.random.default_rng(2026)

    def puntaje(lat, lon, largo, rumbo):
        poligono = shape(poligono_desde_ruta_recta(lat, lon, largo, rumbo))
        return scoring.calcular_score(gdf_incidentes, gdf_censo, poligono, FECHA)

    print(f"=== Rutas angostas (buffer 5.5 m/lado), {N_POR_LARGO} por largo, fecha {FECHA} ===")
    print(f"{'largo_m':>8} {'area_m2':>9} {'%con_buffer':>12} {'%con_incid':>11} {'score_medio':>12}")
    for largo in LARGOS_M:
        con_buffer = con_incidentes = 0
        scores = []
        for _ in range(N_POR_LARGO):
            lat = rng.uniform(-33.49, -33.41)
            lon = rng.uniform(-70.69, -70.61)
            r = puntaje(lat, lon, largo, rng.uniform(0, 360))
            con_buffer += r["buffer_aplicado_m"] > 0
            con_incidentes += r["n_incidentes_considerados"] > 0
            scores.append(r["risk_score"])
        area = largo * 11
        print(
            f"{largo:>8} {area:>9} {100 * con_buffer / N_POR_LARGO:>11.0f}% "
            f"{100 * con_incidentes / N_POR_LARGO:>10.1f}% {np.mean(scores):>12.2f}"
        )

    violaciones = con_corta = 0
    for _ in range(N_PARES):
        lat = rng.uniform(-33.49, -33.41)
        lon = rng.uniform(-70.69, -70.61)
        rumbo = rng.uniform(0, 360)
        corta = puntaje(lat, lon, 1900, rumbo)
        larga = puntaje(lat, lon, 2200, rumbo)
        con_corta += corta["n_incidentes_considerados"] > 0
        violaciones += larga["risk_score"] < corta["risk_score"]

    print(
        f"\n=== Monotonía (ruta de 2200 m contiene a la de 1900 m, mismo centro/rumbo) ===\n"
        f"pares donde la corta encuentra incidentes: {con_corta}/{N_PARES}\n"
        f"pares donde la LARGA da MENOS riesgo que la corta (imposible): {violaciones}/{N_PARES}"
    )


if __name__ == "__main__":
    main()
