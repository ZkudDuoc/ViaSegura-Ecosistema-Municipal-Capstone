"""Propiedades del margen de búsqueda (buffer) de scoring.py."""

from datetime import date

import numpy as np
from shapely.geometry import box, shape

from app import config
from app.data.censo import METROS_POR_GRADO_LAT, METROS_POR_GRADO_LON, cargar_censo
from app.data.incidents import as_geodataframe, cargar_incidentes
from app.services import scoring
from tests.poligonos_ruta import poligono_desde_ruta_recta


def _datasets():
    gdf_incidentes = as_geodataframe(cargar_incidentes(config.INCIDENTS_DATASET_PATH))
    gdf_censo = cargar_censo(config.INE_CENSUS_DATA_PATH)
    return gdf_incidentes, gdf_censo


def test_el_margen_mide_lo_mismo_en_metros_hacia_norte_y_este():
    """Un grado de longitud mide menos que uno de latitud: el margen debe
    ser ~75 m reales en ambos ejes, no ~75 m al norte y ~90 m al este."""
    original = box(-70.60, -33.40, -70.599, -33.399)
    expandido = scoring._expandir_poligono(original, 75)

    margen_ns = (original.bounds[1] - expandido.bounds[1]) * METROS_POR_GRADO_LAT
    margen_eo = (original.bounds[0] - expandido.bounds[0]) * METROS_POR_GRADO_LON
    assert abs(margen_ns - 75) < 0.5
    assert abs(margen_eo - 75) < 0.5


def test_buffer_cero_deja_el_poligono_intacto():
    original = box(-70.60, -33.40, -70.599, -33.399)
    assert scoring._expandir_poligono(original, 0).equals(original)


def test_una_ruta_mas_larga_nunca_da_menos_riesgo_que_la_corta_que_contiene():
    """Con el criterio por área de la Semana 3 esto fallaba en ~46% de los
    pares (ruta de 2200 m con MENOS riesgo que la de 1900 m que la
    contiene), porque una de las dos recibía margen y la otra no."""
    gdf_incidentes, gdf_censo = _datasets()
    fecha = date(2026, 4, 15)
    rng = np.random.default_rng(99)

    for _ in range(150):
        lat, lon = rng.uniform(-33.49, -33.41), rng.uniform(-70.69, -70.61)
        rumbo = rng.uniform(0, 360)
        corta = scoring.calcular_score(
            gdf_incidentes, gdf_censo,
            shape(poligono_desde_ruta_recta(lat, lon, 1900, rumbo)), fecha,
        )
        larga = scoring.calcular_score(
            gdf_incidentes, gdf_censo,
            shape(poligono_desde_ruta_recta(lat, lon, 2200, rumbo)), fecha,
        )
        assert larga["risk_score"] >= corta["risk_score"]


def test_desactivar_el_buffer_encuentra_menos_o_igual_cantidad_de_incidentes():
    gdf_incidentes, gdf_censo = _datasets()
    poligono = shape(poligono_desde_ruta_recta(-33.4608, -70.6679, 300, 90))
    fecha = date(2026, 10, 15)

    sin = scoring.calcular_score(gdf_incidentes, gdf_censo, poligono, fecha, buffer_m=0)
    con = scoring.calcular_score(gdf_incidentes, gdf_censo, poligono, fecha)

    assert sin["buffer_aplicado_m"] == 0.0
    assert con["buffer_aplicado_m"] == config.BUFFER_BUSQUEDA_M
    assert con["n_incidentes_considerados"] >= sin["n_incidentes_considerados"]
