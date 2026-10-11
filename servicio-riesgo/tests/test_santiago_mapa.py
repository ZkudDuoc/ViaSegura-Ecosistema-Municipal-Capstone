"""Semana 6: Santiago Centro, mapa de calles y score con exposición vial.

Cubre el reparto del total CEAD por calle, los niveles relativos, la
congestión escalonada por hora, el GeoJSON listo para el mapa y los campos
nuevos de /score. Los tests que dependen de calles reales de Santiago se
omiten si SECTRA no estuvo disponible y el servicio cayó a la red simulada.
"""

from collections import Counter

import pytest
from shapely.geometry import shape

from app.data.criminalidad_real import CRIMINALIDAD_POR_COMUNA
from app.services.calles_riesgo import COLORES_NIVEL
from tests.poligonos_ruta import poligono_desde_ruta_recta

FECHA = "2026-10-15"


def _santiago(client):
    calles = client.app.state.calles
    santiago = calles[calles["comuna"] == "SANTIAGO"]
    if len(santiago) == 0:
        pytest.skip("Sin calles reales de Santiago (red simulada de respaldo)")
    return santiago


def _poligono_en_santiago(client, largo_m=150):
    calle = _santiago(client).iloc[0]
    punto = calle.geometry.interpolate(0.5, normalized=True)
    return poligono_desde_ruta_recta(punto.y, punto.x, largo_m, 90)


def _score(client, poligono, **extra):
    cuerpo = {"poligono": poligono, "fecha": FECHA, "tipo_actividad": "PROGRAMADA", **extra}
    response = client.post("/score", json=cuerpo)
    assert response.status_code == 200
    return response.json()


# --- Bloque 1: niveles relativos a la comuna -----------------------------

def test_niveles_de_santiago_no_se_concentran_en_uno_solo(client):
    _santiago(client)
    calles = client.get("/calles-riesgo?comuna=SANTIAGO").json()["calles"]
    conteo = Counter(c["nivel"] for c in calles)

    assert set(conteo) == {"bajo", "medio", "alto"}
    assert max(conteo.values()) / len(calles) <= 0.60


def test_casi_ninguna_calle_de_santiago_queda_en_riesgo_cero(client):
    """Antes de repartir el total de CEAD, el 98 % de Santiago daba 0.0."""
    _santiago(client)
    calles = client.get("/calles-riesgo?comuna=SANTIAGO").json()["calles"]
    con_riesgo = sum(1 for c in calles if c["risk_score"] > 0)

    assert con_riesgo / len(calles) >= 0.95


# --- Bloque 2: reparto del total CEAD ------------------------------------

def test_los_casos_estimados_suman_el_total_real_de_la_comuna(client):
    santiago = _santiago(client)
    total_real = CRIMINALIDAD_POR_COMUNA["SANTIAGO"].frecuencia_total_casos

    assert santiago["casos_estimados"].sum() == pytest.approx(total_real, rel=1e-6)


def test_comuna_sin_total_capturado_no_inventa_casos(client):
    calles = client.app.state.calles
    sin_total = calles[
        calles["comuna"].isin([c for c, d in CRIMINALIDAD_POR_COMUNA.items() if d.frecuencia_total_casos is None])
    ]
    if len(sin_total) == 0:
        pytest.skip("Sin calles de comunas sin total capturado")

    assert sin_total["casos_estimados"].isna().all()


def test_la_fuente_del_riesgo_se_declara_como_estimacion(client):
    _santiago(client)
    calle = client.get("/calles-riesgo?comuna=SANTIAGO").json()["calles"][0]

    assert "estimación" in calle["fuente_riesgo"]
    assert calle["casos_estimados"] is not None


def test_la_exposicion_relativa_media_de_cada_comuna_es_uno(client):
    """Por construcción (participación x n tramos): 1.0 = tramo típico, salvo
    por el tope EXPOSICION_MAX que recorta los tramos extremos."""
    santiago = _santiago(client)
    assert santiago["exposicion_relativa"].mean() == pytest.approx(1.0, abs=0.15)
    assert santiago["exposicion_relativa"].max() <= 8.0


# --- Bloque 3: congestión por hora ---------------------------------------

def test_la_congestion_baja_de_noche_y_es_estimada(client):
    calles_punta = client.get("/calles-riesgo?comuna=SANTIAGO&hora=8").json()["calles"]
    calles_noche = client.get("/calles-riesgo?comuna=SANTIAGO&hora=3").json()["calles"]
    if not calles_punta:
        pytest.skip("Sin calles de Santiago")

    por_id_punta = {c["calle_id"]: c["congestion_score"] for c in calles_punta}
    for c in calles_noche[:100]:
        assert c["congestion_score"] <= por_id_punta[c["calle_id"]]
    assert sum(c["congestion_score"] for c in calles_noche) < sum(por_id_punta.values())


def test_sin_hora_el_flujo_sectra_queda_sin_modular(client):
    sin_hora = client.get("/calles-riesgo?comuna=SANTIAGO").json()["calles"]
    en_punta = client.get("/calles-riesgo?comuna=SANTIAGO&hora=8").json()["calles"]
    if not sin_hora:
        pytest.skip("Sin calles de Santiago")

    # La hora 8 es la punta (factor 1.0): coincide con el dato SECTRA sin modular.
    assert [c["congestion_score"] for c in sin_hora] == [c["congestion_score"] for c in en_punta]


def test_nivel_de_congestion_es_escalonado(client):
    calles = client.get("/calles-riesgo?comuna=SANTIAGO").json()["calles"]
    if not calles:
        pytest.skip("Sin calles de Santiago")

    assert {c["nivel_congestion"] for c in calles} <= {"bajo", "medio", "alto"}
    assert all(
        (c["flujo_vehicular_hora"] >= 4000) == (c["nivel_congestion"] == "alto") for c in calles
    )


def test_hora_fuera_de_rango_es_rechazada(client):
    assert client.get("/calles-riesgo?hora=24").status_code == 422
    assert client.get("/calles-riesgo?hora=-1").status_code == 422


def test_health_reporta_la_cobertura_de_las_calles(client):
    cobertura = client.get("/health").json()["cobertura_calles"]

    assert set(cobertura) == {
        "tramos_con_comuna", "tramos_sin_comuna", "tramos_sin_nombre", "comunas", "tramos_santiago",
    }
    assert cobertura["tramos_con_comuna"] + cobertura["tramos_sin_comuna"] == client.get("/health").json()["datasets"]["tramos_calle"]


# --- Bloque 4: GeoJSON listo para el mapa --------------------------------

def test_geojson_es_una_feature_collection_con_color_por_calle(client):
    _santiago(client)
    body = client.get("/calles-riesgo?comuna=SANTIAGO&formato=geojson").json()

    assert body["type"] == "FeatureCollection"
    assert body["metadata"]["total"] == len(body["features"]) > 0
    assert body["metadata"]["comuna"] == "SANTIAGO"
    assert body["metadata"]["metrica"] == "riesgo"
    feature = body["features"][0]
    assert feature["type"] == "Feature"
    assert feature["geometry"]["type"] == "LineString"
    assert set(feature["properties"]) == {
        "calle_id", "nombre", "comuna", "risk_score", "nivel", "congestion_score",
        "nivel_congestion", "flujo_vehicular_hora", "n_incidentes", "color",
    }
    for f in body["features"][:200]:
        assert f["properties"]["color"] == COLORES_NIVEL[f["properties"]["nivel"]]


def test_geojson_con_metrica_congestion_colorea_por_congestion(client):
    _santiago(client)
    body = client.get("/calles-riesgo?comuna=SANTIAGO&formato=geojson&metrica=congestion").json()

    assert body["metadata"]["metrica"] == "congestion"
    for f in body["features"][:200]:
        assert f["properties"]["color"] == COLORES_NIVEL[f["properties"]["nivel_congestion"]]
    assert {e["nivel"] for e in body["metadata"]["leyenda"]} == {"bajo", "medio", "alto"}


def test_leyenda_de_riesgo_trae_color_y_rango_por_nivel(client):
    _santiago(client)
    leyenda = client.get("/calles-riesgo?comuna=SANTIAGO&formato=geojson").json()["metadata"]["leyenda"]

    assert [e["nivel"] for e in leyenda] == ["bajo", "medio", "alto"]
    assert all(e["color"] == COLORES_NIVEL[e["nivel"]] and e["rango"] for e in leyenda)


def test_geojson_marca_la_congestion_como_estimada_solo_si_hay_hora(client):
    _santiago(client)
    sin = client.get("/calles-riesgo?comuna=SANTIAGO&formato=geojson").json()["metadata"]
    con = client.get("/calles-riesgo?comuna=SANTIAGO&formato=geojson&hora=18").json()["metadata"]

    assert sin["congestion_es_estimada_por_hora"] is False and sin["hora"] is None
    assert con["congestion_es_estimada_por_hora"] is True and con["hora"] == 18


def test_bbox_filtra_las_calles(client):
    santiago = _santiago(client)
    centro = santiago.geometry.iloc[0].centroid
    caja = f"{centro.x - 0.002},{centro.y - 0.002},{centro.x + 0.002},{centro.y + 0.002}"

    todas = client.get("/calles-riesgo?formato=geojson").json()["features"]
    en_caja = client.get(f"/calles-riesgo?formato=geojson&bbox={caja}").json()["features"]

    assert 0 < len(en_caja) < len(todas)
    assert client.get("/calles-riesgo?formato=geojson&bbox=0,0,0.001,0.001").json()["features"] == []


@pytest.mark.parametrize("bbox", ["no,es,un,bbox", "1,2,3", "-70.6,-33.4,-70.7,-33.5"])
def test_bbox_invalido_es_rechazado(client, bbox):
    assert client.get(f"/calles-riesgo?bbox={bbox}").status_code == 422


def test_geojson_de_santiago_pesa_menos_de_un_mega_y_medio_y_va_comprimido(client):
    _santiago(client)
    response = client.get("/calles-riesgo?comuna=SANTIAGO&formato=geojson")

    assert response.headers.get("content-encoding") == "gzip"
    assert len(response.content) < 1_500_000


def test_el_json_original_sigue_igual_sin_parametros_nuevos(client):
    body = client.get("/calles-riesgo").json()

    assert set(body) == {"total_calles", "fuente_datos", "calles"}
    assert "_limites" not in body["calles"][0]


# --- Bloque 5: /score con calles afectadas -------------------------------

def test_score_en_santiago_trae_calles_afectadas_ordenadas(client):
    resultado = _score(client, _poligono_en_santiago(client))
    calles = resultado["calles_afectadas"]

    assert resultado["comuna_detectada"] == "SANTIAGO"
    assert 0 < len(calles) <= 5
    scores = [c["risk_score"] for c in calles]
    assert scores == sorted(scores, reverse=True)
    assert len({c["nombre"] for c in calles}) == len(calles)
    assert set(calles[0]) == {"nombre", "risk_score", "congestion_score"}


def test_el_resumen_nombra_las_calles_y_la_fuente_de_la_congestion(client):
    resumen = _score(client, _poligono_en_santiago(client))["explicacion"]["resumen"]

    assert "calles más expuestas" in resumen
    assert "SECTRA" in resumen


def test_sin_calles_reales_cerca_calles_afectadas_va_vacio_y_se_explica(client):
    alto = poligono_desde_ruta_recta(-33.460763, -70.667891, 150, 90)  # sin calles SECTRA cerca
    resultado = _score(client, alto)

    assert resultado["calles_afectadas"] == []
    assert "estimación por densidad poblacional" in resultado["explicacion"]["resumen"]


def test_hora_inicio_ajusta_la_congestion_de_score(client):
    poligono = _poligono_en_santiago(client)
    sin_hora = _score(client, poligono)["congestion_score"]
    de_noche = _score(client, poligono, hora_inicio=3)["congestion_score"]
    en_punta = _score(client, poligono, hora_inicio=8)["congestion_score"]

    assert en_punta == sin_hora  # la punta (factor 1.0) coincide con el flujo SECTRA
    assert de_noche < sin_hora
    assert "perfil horario" in _score(client, poligono, hora_inicio=3)["explicacion"]["resumen"]


def test_una_ruta_mas_larga_nunca_baja_el_riesgo(client):
    """La exposición usa el máximo de las calles cercanas: si A contiene a B,
    el riesgo de A no puede ser menor (misma propiedad que ya cuida el buffer)."""
    corta = _score(client, _poligono_en_santiago(client, 150))["risk_score"]
    larga = _score(client, _poligono_en_santiago(client, 600))["risk_score"]

    assert larga >= corta


def test_una_calle_de_santiago_sin_incidentes_igual_tiene_linea_base(client):
    """El punto de la mejora: antes daba 0.0 aunque estuviera en la comuna
    con más delitos del país."""
    santiago = _santiago(client)
    sin_incidentes = santiago[santiago["n_incidentes"] == 0].iloc[0]
    punto = sin_incidentes.geometry.interpolate(0.5, normalized=True)
    resultado = _score(client, poligono_desde_ruta_recta(punto.y, punto.x, 150, 90))

    assert resultado["n_incidentes_considerados"] == 0
    assert resultado["risk_score"] > 0


def test_las_features_del_geojson_son_geometrias_validas(client):
    _santiago(client)
    features = client.get("/calles-riesgo?comuna=SANTIAGO&formato=geojson").json()["features"]

    assert all(shape(f["geometry"]).is_valid for f in features[:300])
