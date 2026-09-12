"""Calibración de parámetros de Semana 3.

Corre un lote grande de solicitudes simuladas (tamaño y ubicación
realistas, ver GENERAR_SOLICITUD) sobre el dataset real ya cargado, para
elegir valores de VENTANA_DIAS / RISK_TAU / umbrales de nivel (scoring.py)
y EPS_KM / MIN_SAMPLES (clustering.py) con evidencia en vez de "a ojo".

Uso:
    python scripts/calibrar_parametros.py
"""

import math
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config
from app.data.censo import cargar_censo, generar_censo_simulado
from app.data.incidents import as_geodataframe, cargar_incidentes, generar_incidentes_simulados
from app.services import scoring
from app.services.clustering import calcular_zonas_rojas
from shapely.geometry import box

RANGO_LAT = (-33.49, -33.41)
RANGO_LON = (-70.69, -70.61)
N_SOLICITUDES = 1500
SEMILLA = 123


def generar_solicitudes(n, seed):
    """Simula solicitudes con el tamaño real que van a mandar los choferes:
    entre ~15m y ~300m de lado (arreglar un poste vs. cerrar una cuadra),
    no los polígonos gigantes usados para explorar el dataset en Semana 2."""
    rng = np.random.default_rng(seed)
    solicitudes = []
    for _ in range(n):
        lat = rng.uniform(*RANGO_LAT)
        lon = rng.uniform(*RANGO_LON)
        lado_m = rng.uniform(15, 300)
        dlat = (lado_m / 2) / 111_320
        dlon = (lado_m / 2) / 92_800
        poligono = box(lon - dlon, lat - dlat, lon + dlon, lat + dlat)
        dias_offset = int(rng.integers(0, 365))
        fecha = date(2025, 1, 1) + timedelta(days=dias_offset)
        solicitudes.append(poligono)
        solicitudes[-1] = (poligono, fecha)
    return solicitudes


def resumen_niveles(gdf_incidentes, gdf_censo, solicitudes, ventana_dias, tau, umbral_bm, umbral_ma):
    scoring.VENTANA_DIAS = ventana_dias
    scoring.RISK_TAU = tau
    scoring.NIVEL_UMBRAL_BAJO_MEDIO = umbral_bm
    scoring.NIVEL_UMBRAL_MEDIO_ALTO = umbral_ma

    niveles = {"bajo": 0, "medio": 0, "alto": 0}
    scores = []
    for poligono, fecha in solicitudes:
        r = scoring.calcular_score(gdf_incidentes, gdf_censo, poligono, fecha, ventana_dias)
        niveles[r["nivel"]] += 1
        scores.append(r["risk_score"])
    return niveles, scores


def main():
    generar_incidentes_simulados(config.INCIDENTS_DATASET_PATH)
    generar_censo_simulado(config.INE_CENSUS_DATA_PATH)
    incidentes = cargar_incidentes(config.INCIDENTS_DATASET_PATH)
    censo = cargar_censo(config.INE_CENSUS_DATA_PATH)
    gdf_incidentes = as_geodataframe(incidentes)

    solicitudes = generar_solicitudes(N_SOLICITUDES, SEMILLA)

    print(f"=== {N_SOLICITUDES} solicitudes simuladas (15-300m de lado, fecha random en el año) ===\n")

    print("--- Barrido de VENTANA_DIAS (con RISK_TAU=6.0, umbrales 34/67) ---")
    for ventana in [15, 30, 45, 60, 90]:
        niveles, scores = resumen_niveles(gdf_incidentes, censo, solicitudes, ventana, 6.0, 34, 67)
        con_datos = sum(1 for s in scores if s > 0)
        print(f"ventana={ventana:>3}d  bajo={niveles['bajo']:>4}  medio={niveles['medio']:>4}  "
              f"alto={niveles['alto']:>4}  (con_incidentes={con_datos})")

    print("\n--- Barrido de RISK_TAU (con VENTANA_DIAS=45, umbrales 34/67) ---")
    for tau in [3.0, 4.5, 6.0, 8.0, 10.0]:
        niveles, scores = resumen_niveles(gdf_incidentes, censo, solicitudes, 45, tau, 34, 67)
        print(f"tau={tau:>5}  bajo={niveles['bajo']:>4}  medio={niveles['medio']:>4}  alto={niveles['alto']:>4}")

    print("\n--- Barrido de umbrales de nivel (con VENTANA_DIAS=45, TAU=6.0) ---")
    for umbral_bm, umbral_ma in [(20, 50), (25, 55), (34, 67), (40, 70)]:
        niveles, scores = resumen_niveles(gdf_incidentes, censo, solicitudes, 45, 6.0, umbral_bm, umbral_ma)
        print(f"umbrales={umbral_bm:>2}/{umbral_ma:<2}  bajo={niveles['bajo']:>4}  medio={niveles['medio']:>4}  alto={niveles['alto']:>4}")

    scoring.VENTANA_DIAS = 45
    scoring.RISK_TAU = 6.0
    scoring.NIVEL_UMBRAL_BAJO_MEDIO = 34
    scoring.NIVEL_UMBRAL_MEDIO_ALTO = 67

    print("\n=== Barrido de DBSCAN (EPS_KM / MIN_SAMPLES) sobre los 594 incidentes ===")
    for eps_km in [0.2, 0.35, 0.5, 0.75]:
        for min_samples in [3, 5, 8]:
            zonas = calcular_zonas_rojas(gdf_incidentes, censo, eps_km=eps_km, min_samples=min_samples)
            n_incidentes_en_cluster = sum(z["n_incidentes"] for z in zonas)
            print(f"eps={eps_km:>4}km  min_samples={min_samples}  n_clusters={len(zonas):>3}  "
                  f"incidentes_agrupados={n_incidentes_en_cluster:>4}/594")


if __name__ == "__main__":
    main()
