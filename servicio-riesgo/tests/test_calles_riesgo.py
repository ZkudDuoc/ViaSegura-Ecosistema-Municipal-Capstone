"""GET /calles-riesgo (Semana 5): riesgo y congestión por calle real, para
pintar el mapa. No se fija un total exacto de calles a propósito: si
SECTRA no está disponible al generar el dataset, cae a una red simulada
más chica (ver app/data/calles.py) y el test debe seguir siendo válido."""


def test_calles_riesgo_devuelve_al_menos_una_calle(client):
    response = client.get("/calles-riesgo")
    body = response.json()

    assert response.status_code == 200
    assert body["total_calles"] == len(body["calles"])
    assert body["total_calles"] > 0
    assert "fuente_datos" in body


def test_cada_calle_tiene_los_campos_esperados(client):
    body = client.get("/calles-riesgo").json()
    calle = body["calles"][0]

    assert set(calle) == {
        "calle_id", "nombre", "comuna", "risk_score", "nivel",
        "congestion_score", "flujo_vehicular_hora", "n_incidentes",
        "factor_criminalidad_real", "geometry_geojson",
    }
    assert calle["nivel"] in {"bajo", "medio", "alto"}
    assert 0 <= calle["risk_score"] <= 100
    assert 0 <= calle["congestion_score"] <= 100
    assert calle["geometry_geojson"]["type"] == "LineString"


def test_calles_riesgo_ordenadas_por_riesgo_descendente(client):
    calles = client.get("/calles-riesgo").json()["calles"]
    scores = [c["risk_score"] for c in calles]
    assert scores == sorted(scores, reverse=True)


def test_filtro_por_comuna(client):
    todas = client.get("/calles-riesgo").json()["calles"]
    comunas_presentes = {c["comuna"] for c in todas if c["comuna"]}
    if not comunas_presentes:
        return  # dataset de respaldo simulado no trae comunas reales

    alguna_comuna = sorted(comunas_presentes)[0]
    filtradas = client.get(f"/calles-riesgo?comuna={alguna_comuna}").json()["calles"]

    assert len(filtradas) > 0
    assert all(c["comuna"] == alguna_comuna for c in filtradas)
    assert len(filtradas) <= len(todas)


def test_filtro_por_comuna_inexistente_da_lista_vacia(client):
    body = client.get("/calles-riesgo?comuna=COMUNA_QUE_NO_EXISTE_XYZ").json()
    assert body["total_calles"] == 0
    assert body["calles"] == []


def test_factor_de_criminalidad_real_esta_presente_y_es_razonable(client):
    """No se fija un comuna concreta por si cambia el dataset de calles,
    pero el factor siempre debe existir y quedar en un rango razonable."""
    calles = client.get("/calles-riesgo").json()["calles"]
    for calle in calles[:200]:
        assert 0 < calle["factor_criminalidad_real"] < 10


def test_comunas_con_dato_real_capturado_no_usan_el_factor_neutro(client):
    from app.data.criminalidad_real import CRIMINALIDAD_POR_COMUNA

    calles = client.get("/calles-riesgo").json()["calles"]
    comunas_con_dato = {c for c in CRIMINALIDAD_POR_COMUNA}
    alguna = next(
        (c for c in calles if (c["comuna"] or "").upper() in comunas_con_dato), None
    )
    if alguna is None:
        return  # dataset de respaldo simulado no trae estas comunas reales

    assert alguna["factor_criminalidad_real"] != 1.0


def test_comuna_sin_dato_capturado_usa_factor_neutro(client):
    from app.data.criminalidad_real import CRIMINALIDAD_POR_COMUNA

    calles = client.get("/calles-riesgo").json()["calles"]
    comunas_con_dato = {c for c in CRIMINALIDAD_POR_COMUNA}
    sin_dato = next(
        (c for c in calles if c["comuna"] and c["comuna"].upper() not in comunas_con_dato),
        None,
    )
    if sin_dato is None:
        return

    assert sin_dato["factor_criminalidad_real"] == 1.0
