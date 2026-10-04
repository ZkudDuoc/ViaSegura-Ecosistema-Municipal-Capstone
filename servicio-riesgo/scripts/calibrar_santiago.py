"""Calibración de RISK_TAU y BETA_EXPOSICION para Santiago Centro (Semana 6).

Problema que motivó el cambio: con solo incidentes simulados, el 98 % de las
calles de Santiago daba riesgo 0 (mapa todo verde) y el 92 % de las rutas
daba 0.0 en /score, mientras que las rutas con incidentes saturaban cerca de
100 por el factor CEAD (~1.46). Este script mide cómo queda la distribución
con los parámetros vigentes, usando el MISMO flujo que POST /score
(evaluar_score_con_datos_reales), para poder justificar los valores.

Uso:
    python scripts/calibrar_santiago.py                 # parámetros vigentes
    python scripts/calibrar_santiago.py --n 500 --seed 7
Para probar otros valores sin editar código:
    BETA_EXPOSICION=0.25 python scripts/calibrar_santiago.py
(RISK_TAU se cambia en app/services/scoring.py.)
"""

import argparse
import sys
from collections import Counter
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import numpy as np
from shapely.geometry import shape

from app import config
from app.data.calles import cargar_calles, generar_calles
from app.data.censo import cargar_censo, generar_censo_simulado
from app.data.incidents import as_geodataframe, cargar_incidentes, generar_incidentes_simulados
from app.services import scoring
from app.services.calles_riesgo import evaluar_score_con_datos_reales, preparar_calles
from tests.poligonos_ruta import poligono_desde_ruta_recta


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=300, help="rutas de prueba")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--comuna", default=config.COMUNA_PRINCIPAL)
    args = parser.parse_args()

    generar_incidentes_simulados(config.INCIDENTS_DATASET_PATH)
    generar_censo_simulado(config.INE_CENSUS_DATA_PATH)
    generar_calles(config.CALLES_DATASET_PATH)
    gdf_incidentes = as_geodataframe(cargar_incidentes(config.INCIDENTS_DATASET_PATH))
    gdf_censo = cargar_censo(config.INE_CENSUS_DATA_PATH)
    calles = preparar_calles(cargar_calles(config.CALLES_DATASET_PATH), gdf_incidentes)

    zona = calles[calles["comuna"] == args.comuna]
    if len(zona) == 0:
        sys.exit(f"No hay calles reales de {args.comuna} en el dataset.")

    print(f"# RISK_TAU={scoring.RISK_TAU}  BETA_EXPOSICION={scoring.BETA_EXPOSICION}  "
          f"EXPOSICION_MAX={config.EXPOSICION_MAX}")
    print(f"# Calles de {args.comuna}: {len(zona)}\n")

    print("## Riesgo por calle (lo que pinta el mapa)")
    print(f"percentiles 10/33/50/66/80/90/99: {np.percentile(zona['risk_score'], [10, 33, 50, 66, 80, 90, 99]).round(1)}")
    print(f"calles con riesgo 0: {(zona['risk_score'] == 0).mean():.1%}")
    print(f"niveles relativos: {dict(Counter(zona['nivel']))}\n")

    rng = np.random.default_rng(args.seed)
    elegidas = rng.choice(zona.index, min(args.n, len(zona)), replace=False)
    scores = []
    for i in elegidas:
        punto = zona.loc[i].geometry.interpolate(0.5, normalized=True)
        poligono = shape(poligono_desde_ruta_recta(punto.y, punto.x, 150, 90))
        scores.append(
            evaluar_score_con_datos_reales(
                gdf_incidentes, gdf_censo, calles, poligono, date(2026, 10, 15)
            )["risk_score"]
        )
    scores = np.array(scores)
    print(f"## /score sobre {len(scores)} rutas de 150 m en {args.comuna}")
    print(f"percentiles 10/33/50/66/80/90/99: {np.percentile(scores, [10, 33, 50, 66, 80, 90, 99]).round(1)}")
    print(f"rutas con score 0: {(scores == 0).mean():.1%}")
    print(
        f"bajo/medio/alto (umbrales {scoring.NIVEL_UMBRAL_BAJO_MEDIO}/{scoring.NIVEL_UMBRAL_MEDIO_ALTO}): "
        f"{(scores < 34).mean():.0%} / {((scores >= 34) & (scores < 67)).mean():.0%} / {(scores >= 67).mean():.0%}"
    )


if __name__ == "__main__":
    main()
