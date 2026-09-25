"""Busca escenarios reales de riesgo bajo/medio/alto/sin-datos para la demo.

Recorre los incidentes del dataset y, para cada uno, arma la ruta que
generaría el frontend al presionar "iniciar trabajo" (camión centrado en
ese punto + ~5.5 m a cada lado), la evalúa con el mismo `calcular_score`
que usa el servicio, y se queda con el primer caso de cada nivel. Es
determinista: mismo dataset + misma fecha => mismos escenarios.

Sirve para dos cosas: (1) la guía de demo (DEMO.md) — coordenadas GPS que
Agustín puede simular en el frontend — y (2) los tests E2E, que fijan los
valores de una fecha concreta para detectar regresiones de calibración.

Uso:
    python scripts/generar_escenarios_demo.py                  # fecha de hoy
    python scripts/generar_escenarios_demo.py --fecha 2026-10-15
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from shapely.geometry import shape

from app import config
from app.data.censo import cargar_censo, generar_censo_simulado
from app.data.incidents import as_geodataframe, cargar_incidentes, generar_incidentes_simulados
from app.services import scoring
from tests.poligonos_ruta import poligono_desde_ruta_recta

LARGO_M = 150
RUMBO = 90  # este-oeste


def buscar_escenarios(fecha: date):
    generar_incidentes_simulados(config.INCIDENTS_DATASET_PATH)
    generar_censo_simulado(config.INE_CENSUS_DATA_PATH)
    incidentes = cargar_incidentes(config.INCIDENTS_DATASET_PATH)
    gdf_incidentes = as_geodataframe(incidentes)
    gdf_censo = cargar_censo(config.INE_CENSUS_DATA_PATH)

    encontrados = {}
    for fila in incidentes.itertuples():
        poligono = poligono_desde_ruta_recta(fila.latitud, fila.longitud, LARGO_M, RUMBO)
        r = scoring.calcular_score(gdf_incidentes, gdf_censo, shape(poligono), fecha)
        n = r["n_incidentes_considerados"]

        if r["nivel"] == "alto" and n >= 2:
            clave = "alto"
        elif r["nivel"] == "medio":
            clave = "medio"
        elif r["nivel"] == "bajo" and n == 1:
            clave = "bajo"
        else:
            continue
        encontrados.setdefault(
            clave,
            {"lat": fila.latitud, "lon": fila.longitud, "poligono": poligono, "resultado": r},
        )
        if len(encontrados) == 3:
            break

    # Sin datos: rincón del bbox sin incidentes cerca (0 en la ventana).
    lat, lon = -33.4105, -70.6905
    poligono = poligono_desde_ruta_recta(lat, lon, LARGO_M, RUMBO)
    r = scoring.calcular_score(gdf_incidentes, gdf_censo, shape(poligono), fecha)
    encontrados["sin_riesgo"] = {"lat": lat, "lon": lon, "poligono": poligono, "resultado": r}
    return encontrados


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fecha", default=date.today().isoformat())
    args = parser.parse_args()
    fecha = date.fromisoformat(args.fecha)

    print(f"# Escenarios para fecha {fecha} (ruta de {LARGO_M} m, rumbo {RUMBO}°)\n")
    for nombre, e in buscar_escenarios(fecha).items():
        r = e["resultado"]
        print(
            f"## {nombre}: centro GPS (lat {e['lat']}, lon {e['lon']}) -> "
            f"risk_score={r['risk_score']} congestion={r['congestion_score']} "
            f"nivel={r['nivel']} incidentes={r['n_incidentes_considerados']}"
        )
        cuerpo = {"poligono": e["poligono"], "fecha": fecha.isoformat(), "tipo_actividad": "PROGRAMADA"}
        print(json.dumps(cuerpo))
        print()


if __name__ == "__main__":
    main()
