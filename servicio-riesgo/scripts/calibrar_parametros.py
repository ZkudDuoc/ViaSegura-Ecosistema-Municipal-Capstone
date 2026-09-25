"""Calibración de parámetros (Semanas 3 y 4).

Corre un lote grande de solicitudes simuladas sobre el dataset ya cargado,
para elegir VENTANA_DIAS / RISK_TAU / umbrales de nivel / BUFFER_BUSQUEDA_M
(scoring.py) y EPS_KM / MIN_SAMPLES (clustering.py) con evidencia en vez de
"a ojo".

Desde la Semana 4 las solicitudes simuladas son rutas angostas como las
que arma el frontend al presionar "iniciar trabajo" (ver
generar_solicitudes y tests/poligonos_ruta.py).

Uso:
    python scripts/calibrar_parametros.py
"""

import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shapely.geometry import shape

from app import config
from app.data.censo import cargar_censo, generar_censo_simulado
from app.data.incidents import as_geodataframe, cargar_incidentes, generar_incidentes_simulados
from app.services import scoring
from app.services.clustering import calcular_zonas_rojas
from tests.poligonos_ruta import poligono_desde_ruta_recta

RANGO_LAT = (-33.49, -33.41)
RANGO_LON = (-70.69, -70.61)
N_SOLICITUDES = 1500
SEMILLA = 123

# Valores vigentes (los que usa el servicio); cada barrido varía solo uno.
VENTANA_DIAS = 45
RISK_TAU = 2.5
UMBRALES = (34, 67)
BUFFER_M = 75


def generar_solicitudes(n, seed):
    """Simula el polígono auto-calculado del frontend (Anexo A del plan): un
    tramo de 10 a 500 m de ruta con ~5.5 m a cada lado (ancho del camión +
    conos), fecha al azar dentro del año."""
    rng = np.random.default_rng(seed)
    solicitudes = []
    for _ in range(n):
        lat = rng.uniform(*RANGO_LAT)
        lon = rng.uniform(*RANGO_LON)
        largo_m = rng.uniform(10, 500)
        poligono = shape(poligono_desde_ruta_recta(lat, lon, largo_m, rng.uniform(0, 360)))
        fecha = date(2026, 1, 1) + timedelta(days=int(rng.integers(0, 365)))
        solicitudes.append((poligono, fecha))
    return solicitudes


def resumen_niveles(gdf_incidentes, gdf_censo, solicitudes, ventana_dias=VENTANA_DIAS,
                    tau=RISK_TAU, umbrales=UMBRALES, buffer_m=BUFFER_M):
    scoring.RISK_TAU = tau
    scoring.NIVEL_UMBRAL_BAJO_MEDIO, scoring.NIVEL_UMBRAL_MEDIO_ALTO = umbrales

    niveles = {"bajo": 0, "medio": 0, "alto": 0}
    con_incidentes = 0
    for poligono, fecha in solicitudes:
        r = scoring.calcular_score(gdf_incidentes, gdf_censo, poligono, fecha, ventana_dias, buffer_m)
        niveles[r["nivel"]] += 1
        con_incidentes += r["n_incidentes_considerados"] > 0
    return niveles, con_incidentes


def linea(etiqueta, niveles, con_incidentes):
    return (f"{etiqueta}  bajo={niveles['bajo']:>4}  medio={niveles['medio']:>4}  "
            f"alto={niveles['alto']:>4}  (con_incidentes={con_incidentes})")


def main():
    generar_incidentes_simulados(config.INCIDENTS_DATASET_PATH)
    generar_censo_simulado(config.INE_CENSUS_DATA_PATH)
    incidentes = cargar_incidentes(config.INCIDENTS_DATASET_PATH)
    censo = cargar_censo(config.INE_CENSUS_DATA_PATH)
    gdf_incidentes = as_geodataframe(incidentes)
    solicitudes = generar_solicitudes(N_SOLICITUDES, SEMILLA)

    print(f"=== {N_SOLICITUDES} solicitudes simuladas (rutas de 10-500 m + 5.5 m/lado, "
          f"fecha al azar en el año) ===")
    print(f"vigentes: ventana={VENTANA_DIAS}d tau={RISK_TAU} umbrales={UMBRALES} buffer={BUFFER_M}m\n")

    print("--- VENTANA_DIAS ---")
    for ventana in [15, 30, 45, 60, 90]:
        print(linea(f"ventana={ventana:>3}d",
                    *resumen_niveles(gdf_incidentes, censo, solicitudes, ventana_dias=ventana)))

    print("\n--- RISK_TAU ---")
    for tau in [1.5, 2.0, 2.5, 3.5, 4.5, 6.0]:
        print(linea(f"tau={tau:>4}", *resumen_niveles(gdf_incidentes, censo, solicitudes, tau=tau)))

    print("\n--- Umbrales de nivel ---")
    for umbrales in [(20, 50), (25, 55), (34, 67), (40, 70)]:
        print(linea(f"umbrales={umbrales[0]:>2}/{umbrales[1]:<2}",
                    *resumen_niveles(gdf_incidentes, censo, solicitudes, umbrales=umbrales)))

    print("\n--- BUFFER_BUSQUEDA_M (margen alrededor del polígono) ---")
    for buffer_m in [0, 25, 50, 75, 100, 150]:
        print(linea(f"buffer={buffer_m:>3}m", *resumen_niveles(gdf_incidentes, censo, solicitudes, buffer_m=buffer_m)))

    scoring.RISK_TAU = RISK_TAU
    scoring.NIVEL_UMBRAL_BAJO_MEDIO, scoring.NIVEL_UMBRAL_MEDIO_ALTO = UMBRALES

    print(f"\n=== DBSCAN (EPS_KM / MIN_SAMPLES) sobre los {len(incidentes)} incidentes limpios ===")
    for eps_km in [0.2, 0.35, 0.5, 0.75]:
        for min_samples in [3, 5, 8]:
            zonas = calcular_zonas_rojas(gdf_incidentes, censo, eps_km=eps_km, min_samples=min_samples)
            agrupados = sum(z["n_incidentes"] for z in zonas)
            print(f"eps={eps_km:>4}km  min_samples={min_samples}  n_clusters={len(zonas):>3}  "
                  f"incidentes_agrupados={agrupados:>4}/{len(incidentes)}")


if __name__ == "__main__":
    main()
