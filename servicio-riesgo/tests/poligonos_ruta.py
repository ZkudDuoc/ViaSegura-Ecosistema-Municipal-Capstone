"""Simula el cálculo automático de polígono del frontend (Anexo A del plan).

Al presionar "iniciar trabajo", el frontend toma la posición GPS del camión
y arma un polígono angosto: la ruta/tramo ocupado + un margen a cada lado
con el ancho del vehículo (~2.5 m) más la distancia reglamentaria de conos
(~3 m) = ~5.5 m por lado. Este módulo reproduce esa forma para probar
/score con polígonos representativos, sin depender de que el frontend
ya esté listo.
"""

import math

from shapely.geometry import LineString

from app.data.censo import METROS_POR_GRADO_LAT, METROS_POR_GRADO_LON

ANCHO_CAMION_M = 2.5
CONOS_M = 3.0
BUFFER_RUTA_M = ANCHO_CAMION_M + CONOS_M


def poligono_desde_linea(puntos_latlon, buffer_m=BUFFER_RUTA_M):
    """GeoJSON Polygon (anillo cerrado) = línea de puntos (lat, lon) con un
    margen de `buffer_m` metros a cada lado y en los extremos (los conos
    también se ponen adelante y atrás del camión)."""
    lat0, lon0 = puntos_latlon[0]
    linea_m = LineString(
        [
            ((lon - lon0) * METROS_POR_GRADO_LON, (lat - lat0) * METROS_POR_GRADO_LAT)
            for lat, lon in puntos_latlon
        ]
    )
    contorno_m = linea_m.buffer(buffer_m, cap_style="square", join_style="mitre")
    anillo = [
        [lon0 + x / METROS_POR_GRADO_LON, lat0 + y / METROS_POR_GRADO_LAT]
        for x, y in contorno_m.exterior.coords
    ]
    return {"type": "Polygon", "coordinates": [anillo]}


def poligono_desde_ruta_recta(lat, lon, largo_m, rumbo_grados, buffer_m=BUFFER_RUTA_M):
    """Ruta recta de `largo_m` centrada en (lat, lon), orientada según
    `rumbo_grados` (0 = norte, 90 = este)."""
    rumbo = math.radians(rumbo_grados)
    mitad = largo_m / 2
    dlat = math.cos(rumbo) * mitad / METROS_POR_GRADO_LAT
    dlon = math.sin(rumbo) * mitad / METROS_POR_GRADO_LON
    return poligono_desde_linea(
        [(lat - dlat, lon - dlon), (lat + dlat, lon + dlon)], buffer_m
    )
