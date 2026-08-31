"""Carga y limpieza del dataset simulado de incidentes delictivos.

Semana 1 (Módulo 3): el dataset real de incidentes no está disponible a
tiempo (riesgo #5 del plan), por lo que se simula uno con una distribución
geográfica y temporal razonable dentro de la comuna piloto, para que el
pipeline de riesgo (Semana 2: score + clustering) pueda desarrollarse de
forma independiente.
"""

from pathlib import Path

import numpy as np
import pandas as pd

# Bbox aproximado de la comuna piloto (Santiago, RM) usado solo para
# simular coordenadas plausibles de incidentes.
LAT_RANGE = (-33.50, -33.40)
LON_RANGE = (-70.70, -70.60)

TIPOS_INCIDENTE = [
    "robo_con_violencia",
    "robo_vehiculo",
    "hurto",
    "lesiones",
    "vandalismo",
]

GRAVEDAD_CATEGORIAS = ["baja", "media", "alta"]

REQUIRED_COLUMNS = [
    "id_incidente",
    "fecha",
    "tipo_incidente",
    "latitud",
    "longitud",
    "comuna",
    "gravedad",
]


def generate_simulated_incidents(path: Path, n: int = 600, seed: int = 42) -> None:
    """Genera un CSV de incidentes simulados si el archivo no existe."""
    if path.exists():
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)

    fechas = pd.to_datetime("2025-01-01") + pd.to_timedelta(
        rng.integers(0, 240, size=n), unit="D"
    )

    df = pd.DataFrame(
        {
            "id_incidente": np.arange(1, n + 1),
            "fecha": fechas.strftime("%Y-%m-%d"),
            "tipo_incidente": rng.choice(TIPOS_INCIDENTE, size=n),
            "latitud": rng.uniform(*LAT_RANGE, size=n).round(6),
            "longitud": rng.uniform(*LON_RANGE, size=n).round(6),
            "comuna": "Comuna Piloto",
            "gravedad": rng.choice(
                GRAVEDAD_CATEGORIAS, size=n, p=[0.5, 0.35, 0.15]
            ),
        }
    )

    # Inyecta algo de suciedad realista (nulos, duplicados) para que la
    # limpieza en load_incidents() tenga algo concreto que resolver.
    df.loc[rng.choice(n, size=max(1, n // 100), replace=False), "gravedad"] = None
    df = pd.concat([df, df.sample(3, random_state=seed)], ignore_index=True)

    df.to_csv(path, index=False)


def load_incidents(path: Path) -> pd.DataFrame:
    """Carga y limpia el dataset de incidentes delictivos.

    Limpieza aplicada:
    - valida que existan las columnas esperadas.
    - descarta duplicados exactos.
    - parsea `fecha` a datetime (descarta filas no parseables).
    - descarta filas con lat/lon fuera de rango físico válido.
    - normaliza `tipo_incidente` (minúsculas, sin espacios extra).
    - normaliza `gravedad` a una categoría ordenada; filas sin gravedad
      válida se descartan porque el score de riesgo (Semana 2) depende
      de ese campo.
    """
    df = pd.read_csv(path)

    missing = set(REQUIRED_COLUMNS) - set(df.columns)
    if missing:
        raise ValueError(f"Dataset de incidentes: faltan columnas {missing}")

    df = df.drop_duplicates()

    df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce")
    df = df.dropna(subset=["fecha"])

    df = df[df["latitud"].between(-90, 90) & df["longitud"].between(-180, 180)]

    df["tipo_incidente"] = df["tipo_incidente"].str.strip().str.lower()

    df["gravedad"] = df["gravedad"].str.strip().str.lower()
    df["gravedad"] = pd.Categorical(
        df["gravedad"], categories=GRAVEDAD_CATEGORIAS, ordered=True
    )
    df = df.dropna(subset=["gravedad"])

    df["comuna"] = df["comuna"].str.strip()

    return df.reset_index(drop=True)
