"""Riesgo y congestión por tramo de calle real (Semanas 5-6).

Complementa /score (que evalúa UN polígono puntual por solicitud) con una
capa agregada para pintar el mapa: cada calle real (ver app/data/calles.py,
datos de SECTRA) recibe su propio índice de riesgo y su congestión.

**Riesgo por calle (Semana 6).** No existen incidentes puntuales reales
públicos, y los simulados dejaban el 98 % de Santiago con riesgo 0 (mapa
todo verde). Por eso el total REAL de delitos de la comuna (CEAD,
app/data/criminalidad_real.py) se reparte entre sus calles ponderando por
flujo vehicular de SECTRA × largo del tramo: más gente y más calle
recorrida = más exposición. Eso da una "exposición relativa" por tramo
(1.0 = tramo típico de su comuna) que se suma, con peso BETA_EXPOSICION, a
los incidentes simulados cercanos y se multiplica por el factor de
criminalidad de la comuna. **Es una estimación, no un dato puntual real**, y
así se rotula (`fuente_riesgo`).

**Niveles relativos.** `nivel` de cada calle es relativo a su comuna (p33 y
p80 del riesgo dentro de la comuna): sirve para decidir dónde mirar primero.
El `nivel` de /score, en cambio, es absoluto (34/67) porque decide si una
solicitud entra a la cola. La leyenda del mapa explica la diferencia.

**Congestión.** Escalonada y honesta con el dato (ver congestion.py), con un
perfil horario opcional marcado como estimación.

`datos_reales_cerca()` y `evaluar_score_con_datos_reales()` son lo que
comparten /score y /ranking-inspecciones para usar estos mismos datos
reales cuando el polígono cae cerca de una calle real.
"""

import warnings

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import mapping
from shapely.geometry.base import BaseGeometry

from app import config
from app.data.censo import METROS_POR_GRADO_LAT, METROS_POR_GRADO_LON
from app.data.criminalidad_real import CRIMINALIDAD_POR_COMUNA, factor_para_comuna
from app.services.congestion import (
    UMBRAL_ALTO_VEH_H,
    UMBRAL_MEDIO_VEH_H,
    factor_horario,
    niveles_congestion,
)
from app.services.scoring import (
    BETA_EXPOSICION,
    BUFFER_BUSQUEDA_M,
    GRAVEDAD_PESOS,
    RISK_TAU,
    _expandir_poligono,
    calcular_score,
)

BUFFER_CALLE_M = 15  # corredor a cada lado de la calle donde se buscan incidentes
CRS_METROS = "EPSG:32719"  # UTM 19S: largos en metros reales para Santiago
PERCENTIL_BAJO = 33
PERCENTIL_ALTO = 80
MIN_CALLES_PARA_PERCENTIL_PROPIO = 50  # comunas más chicas usan el percentil de toda la red
SIMPLIFICAR_GRADOS = 0.00002  # ~2 m: invisible en el mapa, reduce el peso del GeoJSON
DECIMALES_COORD = 6  # ~10 cm

COLORES_NIVEL = {"bajo": "#2E7D32", "medio": "#F9A825", "alto": "#C62828"}
FUENTE_RIESGO = "CEAD distribuido por flujo (estimación)"
FUENTE_RIESGO_SIN_CEAD = "flujo SECTRA, comuna sin dato CEAD (estimación neutra)"
SIN_COMUNA = "(sin comuna)"


def _geojson_simplificado(geometria: BaseGeometry) -> dict:
    simple = geometria.simplify(SIMPLIFICAR_GRADOS, preserve_topology=True)
    geo = mapping(simple)
    return {
        "type": geo["type"],
        "coordinates": [
            [round(x, DECIMALES_COORD), round(y, DECIMALES_COORD)] for x, y in geo["coordinates"]
        ],
    }


def _clave_comuna(serie: pd.Series) -> pd.Series:
    return serie.fillna("").replace("", SIN_COMUNA)


def preparar_calles(
    gdf_calles: gpd.GeoDataFrame,
    gdf_incidentes: gpd.GeoDataFrame,
    buffer_calle_m: float = BUFFER_CALLE_M,
) -> gpd.GeoDataFrame:
    """Devuelve una copia de la red de calles con todo lo que /calles-riesgo y
    /score necesitan precalculado (una sola vez al levantar el servicio):
    largo, exposición relativa, casos estimados (CEAD), incidentes del
    corredor, riesgo, nivel relativo a la comuna y geometría simplificada."""
    gdf = gdf_calles.copy()
    if len(gdf) == 0:
        return gdf

    gdf["comuna_clave"] = _clave_comuna(gdf["comuna"])
    gdf["largo_m"] = gdf.to_crs(CRS_METROS).geometry.length
    gdf["peso_tramo"] = gdf["largo_m"] * gdf["flujo_v_h"].astype(float)

    # --- exposición relativa y casos estimados (CEAD repartido) -----------
    grupo = gdf.groupby("comuna_clave")["peso_tramo"]
    suma_peso = grupo.transform("sum")
    n_tramos = grupo.transform("size")
    participacion = (gdf["peso_tramo"] / suma_peso).where(suma_peso > 0, 1 / n_tramos)
    gdf["participacion_comuna"] = participacion
    gdf["exposicion_relativa"] = np.minimum(participacion * n_tramos, config.EXPOSICION_MAX)

    total_cead = gdf["comuna_clave"].map(
        {c: d.frecuencia_total_casos for c, d in CRIMINALIDAD_POR_COMUNA.items()}
    )
    gdf["casos_estimados"] = total_cead * participacion  # NaN si la comuna no tiene total
    gdf["fuente_riesgo"] = np.where(
        gdf["comuna_clave"].isin(CRIMINALIDAD_POR_COMUNA.keys()), FUENTE_RIESGO, FUENTE_RIESGO_SIN_CEAD
    )
    gdf["factor_criminalidad"] = gdf["comuna"].map(lambda c: factor_para_comuna(c or None))

    # --- incidentes simulados dentro del corredor de cada calle -----------
    buffer_grados = (
        (buffer_calle_m / METROS_POR_GRADO_LAT) + (buffer_calle_m / METROS_POR_GRADO_LON)
    ) / 2
    # geopandas avisa que bufear en un CRS geográfico (grados) no es exacto
    # — ya convertimos metros->grados arriba (misma aproximación que usan
    # censo.py y scoring.py en todo el proyecto), así que es la advertencia
    # esperada, no un error.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        geometria_corredores = gdf.geometry.buffer(buffer_grados)
    corredores = gpd.GeoDataFrame(
        {"indice_calle": gdf.index}, geometry=geometria_corredores, crs=gdf.crs,
    )
    cruce = gpd.sjoin(
        gdf_incidentes[["geometry", "gravedad"]], corredores[["geometry", "indice_calle"]],
        how="inner", predicate="within",
    )
    pesos = cruce["gravedad"].astype(str).map(GRAVEDAD_PESOS).fillna(0)
    suma_por_calle = pesos.groupby(cruce["indice_calle"]).sum()
    conteo_por_calle = cruce.groupby("indice_calle").size()
    gdf["suma_incidentes"] = gdf.index.map(lambda i: float(suma_por_calle.get(i, 0.0)))
    gdf["n_incidentes"] = gdf.index.map(lambda i: int(conteo_por_calle.get(i, 0)))

    # --- riesgo (misma fórmula que /score) y nivel relativo a la comuna ----
    suma = (gdf["suma_incidentes"] + BETA_EXPOSICION * gdf["exposicion_relativa"]) * gdf["factor_criminalidad"]
    gdf["risk_score"] = (100 * (1 - np.exp(-suma / RISK_TAU))).round(2)

    umbrales_globales = np.percentile(gdf["risk_score"], [PERCENTIL_BAJO, PERCENTIL_ALTO])
    bajo, alto = [], []
    for clave, sub in gdf.groupby("comuna_clave"):
        if len(sub) >= MIN_CALLES_PARA_PERCENTIL_PROPIO:
            u = np.percentile(sub["risk_score"], [PERCENTIL_BAJO, PERCENTIL_ALTO])
        else:
            u = umbrales_globales
        bajo.append(pd.Series(u[0], index=sub.index))
        alto.append(pd.Series(u[1], index=sub.index))
    gdf["umbral_bajo"] = pd.concat(bajo).reindex(gdf.index)
    gdf["umbral_alto"] = pd.concat(alto).reindex(gdf.index)
    gdf["nivel"] = np.where(
        gdf["risk_score"] > gdf["umbral_alto"],
        "alto",
        np.where(gdf["risk_score"] > gdf["umbral_bajo"], "medio", "bajo"),
    )

    gdf["geometry_geojson"] = gdf.geometry.map(_geojson_simplificado)
    gdf["limites"] = gdf.geometry.map(lambda g: tuple(round(v, 6) for v in g.bounds))
    return gdf


def datos_reales_cerca(
    poligono: BaseGeometry,
    gdf_calles: gpd.GeoDataFrame,
    buffer_m: float,
    hora: int | None = None,
) -> dict:
    """Busca calles reales de SECTRA que toquen `poligono` (expandido
    `buffer_m` metros, mismo criterio que BUFFER_BUSQUEDA_M de scoring.py)
    y devuelve: congestión real (promedio del flujo de esas calles,
    modulado por `hora` si se pide), la comuna real más frecuente entre
    ellas, la exposición vial máxima (monótona: una ruta más larga nunca
    baja el riesgo) y las calles más expuestas. Si no hay ninguna calle
    cerca, devuelve comuna=None y congestion_score=None (el llamador decide
    el respaldo)."""
    vacio = {
        "comuna": None,
        "congestion_score": None,
        "n_calles_cercanas": 0,
        "exposicion_relativa": 0.0,
        "calles_afectadas": [],
    }
    if len(gdf_calles) == 0:
        return vacio

    poligono_expandido = _expandir_poligono(poligono, buffer_m)
    cercanas = gdf_calles[gdf_calles.intersects(poligono_expandido)]
    if len(cercanas) == 0:
        return vacio

    comunas_validas = cercanas["comuna"][cercanas["comuna"].astype(bool)]
    comuna = comunas_validas.mode().iloc[0] if len(comunas_validas) > 0 else None
    congestion_score = round(
        float(cercanas["congestion_normalizada"].mean()) * factor_horario(hora) * 100, 2
    )

    exposicion = 0.0
    calles_afectadas: list[dict] = []
    if "exposicion_relativa" in cercanas.columns:
        exposicion = float(cercanas["exposicion_relativa"].max())
        por_nombre = cercanas.sort_values("risk_score", ascending=False).drop_duplicates("nombre")
        factor = factor_horario(hora)
        for fila in por_nombre.head(5).itertuples():
            calles_afectadas.append(
                {
                    "nombre": str(fila.nombre).title(),
                    "risk_score": float(fila.risk_score),
                    "congestion_score": round(float(fila.congestion_normalizada) * factor * 100, 2),
                }
            )
    return {
        "comuna": comuna,
        "congestion_score": congestion_score,
        "n_calles_cercanas": int(len(cercanas)),
        "exposicion_relativa": exposicion,
        "calles_afectadas": calles_afectadas,
    }


def evaluar_score_con_datos_reales(
    gdf_incidentes: gpd.GeoDataFrame,
    gdf_censo: gpd.GeoDataFrame,
    gdf_calles: gpd.GeoDataFrame,
    poligono: BaseGeometry,
    fecha,
    hora_congestion: int | None = None,
    **kwargs_score,
) -> dict:
    """Mismo flujo que usa POST /score (main.py) y /ranking-inspecciones:
    busca si hay una calle real (SECTRA) cerca del polígono, y si la hay,
    usa su congestión real, la exposición vial y el factor de criminalidad
    real de esa comuna (CEAD) en vez del proxy de densidad poblacional. Se
    deja acá, compartida, para que scripts/generar_escenarios_demo.py y los
    tests no reimplementen esta lógica aparte y terminen desincronizados de
    lo que el endpoint real responde — ya pasó una vez (ver Semana 5).

    `hora_congestion`: si viene, la congestión real se modula con el perfil
    horario (ver congestion.py); None deja el flujo SECTRA sin modular."""
    reales = datos_reales_cerca(poligono, gdf_calles, BUFFER_BUSQUEDA_M, hora=hora_congestion)
    factor_real = factor_para_comuna(reales["comuna"])

    resultado = calcular_score(
        gdf_incidentes, gdf_censo, poligono, fecha,
        factor_criminalidad=factor_real, comuna=reales["comuna"],
        exposicion_relativa=reales["exposicion_relativa"], **kwargs_score,
    )
    con_calles = reales["congestion_score"] is not None
    if con_calles:
        resultado["congestion_score"] = reales["congestion_score"]

    resultado["comuna_detectada"] = reales["comuna"]
    resultado["calles_afectadas"] = reales["calles_afectadas"]
    resultado["fuente_congestion"] = (
        f"real (SECTRA, {reales['n_calles_cercanas']} calles cercanas)"
        if con_calles
        else "estimada (densidad poblacional simulada)"
    )

    resumen = resultado["explicacion"]["resumen"]
    if reales["calles_afectadas"]:
        nombres = ", ".join(c["nombre"] for c in reales["calles_afectadas"][:3])
        resumen += f" Las calles más expuestas de la zona son {nombres}."
    if con_calles:
        resumen += " La congestión viene del flujo vehicular de SECTRA"
        if hora_congestion is not None:
            resumen += (
                f", ajustado a las {hora_congestion}:00 h con un perfil horario típico "
                f"(estimación: SECTRA no publica la hora del flujo)."
            )
        else:
            resumen += "."
    else:
        resumen += " No hay calles de SECTRA cerca, así que la congestión es una estimación por densidad poblacional."
    resultado["explicacion"]["resumen"] = resumen
    return resultado


def construir_calles(gdf_calles: gpd.GeoDataFrame, hora: int | None = None) -> list[dict]:
    """Lista de calles lista para servir (ordenada por riesgo descendente).
    `hora` solo modula la congestión (perfil horario, ver congestion.py); el
    riesgo no depende de la hora. Requiere un gdf ya pasado por
    preparar_calles()."""
    if len(gdf_calles) == 0:
        return []

    factor = factor_horario(hora)
    congestion = gdf_calles["congestion_normalizada"].to_numpy() * factor * 100
    flujo_efectivo = gdf_calles["flujo_v_h"].to_numpy() * factor
    niveles_cong = niveles_congestion(flujo_efectivo)

    calles = []
    for i, (idx, calle) in enumerate(gdf_calles.iterrows()):
        casos = calle["casos_estimados"]
        calles.append(
            {
                "calle_id": int(idx),
                "nombre": calle["nombre"],
                "comuna": calle["comuna"] or None,
                "risk_score": float(calle["risk_score"]),
                "nivel": calle["nivel"],
                "congestion_score": round(float(congestion[i]), 2),
                "nivel_congestion": str(niveles_cong[i]),
                "flujo_vehicular_hora": (
                    None if pd.isna(calle["flujo_v_h"]) else float(calle["flujo_v_h"])
                ),
                "n_incidentes": int(calle["n_incidentes"]),
                "factor_criminalidad_real": float(calle["factor_criminalidad"]),
                "casos_estimados": None if pd.isna(casos) else round(float(casos), 2),
                "fuente_riesgo": calle["fuente_riesgo"],
                "geometry_geojson": calle["geometry_geojson"],
                "_limites": calle["limites"],
            }
        )

    calles.sort(key=lambda c: c["risk_score"], reverse=True)
    return calles


def calcular_riesgo_calles(
    gdf_incidentes: gpd.GeoDataFrame,
    gdf_calles: gpd.GeoDataFrame,
    buffer_calle_m: float = BUFFER_CALLE_M,
) -> list[dict]:
    """Atajo (compatibilidad con Semana 5): prepara la red y la sirve sin hora."""
    return construir_calles(preparar_calles(gdf_calles, gdf_incidentes, buffer_calle_m))


def leyenda_riesgo(calles: list[dict], comuna: str | None) -> list[dict]:
    if comuna and calles:
        rangos = {}
        for nivel in ("bajo", "medio", "alto"):
            valores = [c["risk_score"] for c in calles if c["nivel"] == nivel]
            rangos[nivel] = f"{min(valores):g} a {max(valores):g}" if valores else "sin calles"
        criterio = f"relativo a {comuna.title()}"
    else:
        rangos = {
            "bajo": f"{PERCENTIL_BAJO}% de calles con menor riesgo de su comuna",
            "medio": "tramo intermedio de su comuna",
            "alto": f"{100 - PERCENTIL_ALTO}% de calles con mayor riesgo de su comuna",
        }
        criterio = "relativo a cada comuna"
    return [
        {"nivel": nivel, "color": COLORES_NIVEL[nivel], "rango": rangos[nivel], "criterio": criterio}
        for nivel in ("bajo", "medio", "alto")
    ]


def leyenda_congestion() -> list[dict]:
    rangos = {
        "bajo": f"menos de {UMBRAL_MEDIO_VEH_H:,} veh/h".replace(",", "."),
        "medio": f"{UMBRAL_MEDIO_VEH_H:,} a {UMBRAL_ALTO_VEH_H - 1:,} veh/h".replace(",", "."),
        "alto": f"{UMBRAL_ALTO_VEH_H:,} veh/h o más".replace(",", "."),
    }
    return [
        {"nivel": nivel, "color": COLORES_NIVEL[nivel], "rango": rangos[nivel], "criterio": "flujo SECTRA"}
        for nivel in ("bajo", "medio", "alto")
    ]


def a_feature_collection(
    calles: list[dict], metrica: str, comuna: str | None, hora: int | None
) -> dict:
    campo_nivel = "nivel" if metrica == "riesgo" else "nivel_congestion"
    features = []
    for c in calles:
        features.append(
            {
                "type": "Feature",
                "geometry": c["geometry_geojson"],
                "properties": {
                    "calle_id": c["calle_id"],
                    "nombre": c["nombre"],
                    "comuna": c["comuna"],
                    "risk_score": c["risk_score"],
                    "nivel": c["nivel"],
                    "congestion_score": c["congestion_score"],
                    "nivel_congestion": c["nivel_congestion"],
                    "flujo_vehicular_hora": c["flujo_vehicular_hora"],
                    "n_incidentes": c["n_incidentes"],
                    "color": COLORES_NIVEL[c[campo_nivel]],
                },
            }
        )
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "total": len(features),
            "comuna": comuna,
            "metrica": metrica,
            "hora": hora,
            "congestion_es_estimada_por_hora": hora is not None,
            "fuente_datos": (
                "Calles y flujo vehicular: SECTRA (Observatorio de Ciudades UC), CC BY-NC 4.0. "
                "Delitos por comuna: CEAD (cead.minsegpublica.gob.cl), captura manual 2025, "
                "repartidos entre las calles según flujo y largo del tramo (estimación, no dato puntual)."
            ),
            "leyenda": leyenda_riesgo(calles, comuna) if metrica == "riesgo" else leyenda_congestion(),
        },
    }
