"""Carga y normalización de datos censales del INE por manzana censal.

Semana 1 (Módulo 3): igual que con los incidentes, se simula un dataset de
manzanas censales con la misma forma que tendría el dato real del INE
(id de manzana, comuna, población y superficie), para que el clustering
DBSCAN/K-Means de Semana 2 pueda normalizar por densidad poblacional sin
depender de que el dato oficial esté disponible a tiempo (riesgo #5 del
plan).

Cada manzana se modela como un polígono cuadrado centrado en (latitud,
longitud), con lado derivado de su superficie — suficiente para
representarla como GeoDataFrame (geopandas) y calcular densidad, sin
requerir los polígonos reales del INE en esta etapa.
"""

from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import box

LAT_RANGE = (-33.50, -33.40)
LON_RANGE = (-70.70, -70.60)

# Metros por grado, aproximado para la latitud de la comuna piloto — solo
# se usa para dibujar el polígono cuadrado de cada manzana simulada.
METERS_PER_DEGREE_LAT = 111_320
METERS_PER_DEGREE_LON = 92_800

REQUIRED_COLUMNS = [
    "id_manzana",
    "comuna",
    "poblacion",
    "superficie_m2",
    "latitud",
    "longitud",
]


def generate_simulated_census(path: Path, n: int = 150, seed: int = 7) -> None:
    """Genera un CSV de manzanas censales simuladas si el archivo no existe."""
    if path.exists():
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)

    df = pd.DataFrame(
        {
            "id_manzana": [f"MZ-{i:04d}" for i in range(1, n + 1)],
            "comuna": "Comuna Piloto",
            "poblacion": rng.integers(20, 900, size=n),
            "superficie_m2": rng.integers(4_000, 60_000, size=n),
            "latitud": rng.uniform(*LAT_RANGE, size=n).round(6),
            "longitud": rng.uniform(*LON_RANGE, size=n).round(6),
        }
    )

    # Suciedad realista: manzanas sin población registrada, superficie 0.
    df.loc[rng.choice(n, size=max(1, n // 50), replace=False), "poblacion"] = None
    df.loc[rng.choice(n, size=1, replace=False), "superficie_m2"] = 0

    df.to_csv(path, index=False)


def _square_polygon(lat: float, lon: float, superficie_m2: float):
    lado_m = superficie_m2**0.5
    dlat = (lado_m / 2) / METERS_PER_DEGREE_LAT
    dlon = (lado_m / 2) / METERS_PER_DEGREE_LON
    return box(lon - dlon, lat - dlat, lon + dlon, lat + dlat)


def load_census(path: Path) -> gpd.GeoDataFrame:
    """Carga, limpia y normaliza el dataset censal del INE por manzana.

    Limpieza aplicada:
    - valida que existan las columnas esperadas.
    - descarta duplicados por `id_manzana`.
    - descarta manzanas sin población o con superficie <= 0 (no se puede
      calcular densidad).
    - construye la geometría (polígono) de cada manzana a partir del
      centroide y la superficie, como GeoDataFrame en EPSG:4326.

    Normalización de densidad (insumo directo para el clustering
    normalizado por densidad poblacional de Semana 2):
    - `densidad_hab_km2`: población / superficie en km².
    - `densidad_normalizada`: min-max de `densidad_hab_km2` a [0, 1],
      para poder ponderar clusters sin que la escala absoluta de
      densidad domine la métrica de distancia del algoritmo.
    """
    df = pd.read_csv(path)

    missing = set(REQUIRED_COLUMNS) - set(df.columns)
    if missing:
        raise ValueError(f"Dataset censal INE: faltan columnas {missing}")

    df = df.drop_duplicates(subset=["id_manzana"])
    df = df.dropna(subset=["poblacion"])
    df = df[df["superficie_m2"] > 0]

    df["poblacion"] = df["poblacion"].astype(int)
    df["comuna"] = df["comuna"].str.strip()

    df["densidad_hab_km2"] = df["poblacion"] / (df["superficie_m2"] / 1_000_000)

    min_d, max_d = df["densidad_hab_km2"].min(), df["densidad_hab_km2"].max()
    rango = max_d - min_d
    df["densidad_normalizada"] = (
        (df["densidad_hab_km2"] - min_d) / rango if rango > 0 else 0.0
    )

    geometry = [
        _square_polygon(row.latitud, row.longitud, row.superficie_m2)
        for row in df.itertuples()
    ]

    gdf = gpd.GeoDataFrame(df, geometry=geometry, crs="EPSG:4326")
    return gdf.reset_index(drop=True)
