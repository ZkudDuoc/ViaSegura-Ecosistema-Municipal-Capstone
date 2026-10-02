"""Semana 5, Anexo B, tarea 3: valida BUFFER_BUSQUEDA_M contra el tamaño
REAL del polígono auto-calculado (18 x 8 m, no los 11 m de ancho que se
usaron de ejemplo en Semana 4) en 3 escenarios reales del dataset:

  a) un punto sin incidentes ni manzanas censales cerca,
  b) el borde exacto de una manzana censal (¿la cuenta el buffer o no?),
  c) el centro de la manzana de mayor densidad poblacional del dataset.

Corre cada caso con buffer_m=0 (el comportamiento "crudo", sin margen) y
con el BUFFER_BUSQUEDA_M vigente, para que el efecto del margen quede
documentado con números reales — no solo con el caso sintético de 20 m
usado en Semana 4.

Uso:
    python scripts/validar_poligono_automatico.py
"""

import sys
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from shapely.geometry import box

from app import config
from app.data.censo import cargar_censo, generar_censo_simulado
from app.data.incidents import as_geodataframe, cargar_incidentes, generar_incidentes_simulados
from app.services import scoring

LARGO_M, ANCHO_M = 18, 8
METROS_POR_GRADO_LAT = 111_320
METROS_POR_GRADO_LON = 92_800


def poligono_18x8(lat: float, lon: float) -> box:
    dlon = (LARGO_M / 2) / METROS_POR_GRADO_LON
    dlat = (ANCHO_M / 2) / METROS_POR_GRADO_LAT
    return box(lon - dlon, lat - dlat, lon + dlon, lat + dlat)


def main():
    generar_incidentes_simulados(config.INCIDENTS_DATASET_PATH)
    generar_censo_simulado(config.INE_CENSUS_DATA_PATH)
    gdf_incidentes = as_geodataframe(cargar_incidentes(config.INCIDENTS_DATASET_PATH))
    gdf_censo = cargar_censo(config.INE_CENSUS_DATA_PATH)

    censo_ordenado = gdf_censo.sort_values("densidad_normalizada", ascending=False)
    manzana_densa = censo_ordenado.iloc[0]
    manzana_cualquiera = gdf_censo.iloc[len(gdf_censo) // 2]
    minx, miny, maxx, maxy = manzana_cualquiera.geometry.bounds
    borde_lat, borde_lon = (miny + maxy) / 2, maxx  # borde este, a mitad de altura

    incidente_cercano = gdf_incidentes.iloc[0]
    desplazamiento_lat = 50 / METROS_POR_GRADO_LAT  # 50 m al norte del incidente
    fecha_default = date(2026, 10, 15)

    escenarios = {
        "(a) sin incidentes ni manzanas cerca": (-33.4105, -70.6905, fecha_default),
        "(b) borde exacto de una manzana censal": (borde_lat, borde_lon, fecha_default),
        "(c) centro de la manzana de mayor densidad": (
            manzana_densa["latitud"], manzana_densa["longitud"], fecha_default,
        ),
        # misma fecha del incidente real, para aislar el efecto espacial
        # del buffer del efecto de la ventana temporal.
        "(d) a 50 m de un incidente real (no encima)": (
            incidente_cercano["latitud"] + desplazamiento_lat,
            incidente_cercano["longitud"],
            incidente_cercano["fecha"].date(),
        ),
    }

    print(f"Polígono real: {LARGO_M}x{ANCHO_M} m. BUFFER_BUSQUEDA_M vigente: {scoring.BUFFER_BUSQUEDA_M} m.\n")

    filas = []
    for nombre, (lat, lon, fecha) in escenarios.items():
        poligono = poligono_18x8(lat, lon)
        sin_buffer = scoring.calcular_score(gdf_incidentes, gdf_censo, poligono, fecha, buffer_m=0)
        con_buffer = scoring.calcular_score(gdf_incidentes, gdf_censo, poligono, fecha)

        print(f"{nombre}  (lat={lat:.6f}, lon={lon:.6f})")
        print(f"  sin buffer -> risk={sin_buffer['risk_score']:>6} nivel={sin_buffer['nivel']:<6} "
              f"congestion={sin_buffer['congestion_score']:>6} incidentes={sin_buffer['n_incidentes_considerados']}")
        print(f"  con buffer -> risk={con_buffer['risk_score']:>6} nivel={con_buffer['nivel']:<6} "
              f"congestion={con_buffer['congestion_score']:>6} incidentes={con_buffer['n_incidentes_considerados']}\n")
        filas.append((nombre, lat, lon, sin_buffer, con_buffer))

    return filas


if __name__ == "__main__":
    main()
