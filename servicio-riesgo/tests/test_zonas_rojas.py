def test_zonas_rojas_devuelve_clusters_precalculados(client):
    response = client.get("/zonas-rojas")

    assert response.status_code == 200
    body = response.json()
    assert body["total_clusters"] > 0
    assert body["total_clusters"] == len(body["zonas"])
    assert "eps_km" in body["parametros"]
    assert "min_samples" in body["parametros"]


def test_zonas_rojas_estan_ordenadas_por_indice_de_riesgo_descendente(client):
    response = client.get("/zonas-rojas")
    zonas = response.json()["zonas"]

    indices = [z["indice_riesgo_normalizado"] for z in zonas]
    assert indices == sorted(indices, reverse=True)


def test_zonas_rojas_tienen_geometria_geojson_valida(client):
    response = client.get("/zonas-rojas")
    zonas = response.json()["zonas"]

    for zona in zonas:
        assert zona["contorno_geojson"]["type"] in {"Polygon", "LineString", "Point"}
        assert "lat" in zona["centroide"] and "lon" in zona["centroide"]


def test_zonas_rojas_no_dependen_de_los_poligonos_consultados_en_score(client):
    """El clustering corre una vez sobre TODOS los incidentes historicos y no
    recibe ningun poligono: por mas consultas /score de rutas angostas (el
    nuevo calculo automatico del frontend) que lleguen, las zonas rojas
    deben quedar identicas (sin estado compartido que se contamine)."""
    from tests.poligonos_ruta import poligono_desde_ruta_recta

    antes = client.get("/zonas-rojas").json()

    for i in range(30):
        client.post(
            "/score",
            json={
                "poligono": poligono_desde_ruta_recta(
                    -33.42 - i * 0.002, -70.64, 80 + i * 20, i * 12
                ),
                "fecha": "2026-10-15",
                "tipo_actividad": "PROGRAMADA",
            },
        )

    assert client.get("/zonas-rojas").json() == antes


def test_zonas_rojas_recalculadas_dan_el_mismo_resultado_que_las_cacheadas(client):
    from app.services.clustering import calcular_zonas_rojas

    cacheadas = client.get("/zonas-rojas").json()["zonas"]
    recalculadas = calcular_zonas_rojas(
        client.app.state.incidents_gdf, client.app.state.census
    )

    assert len(cacheadas) == len(recalculadas)
    assert [z["n_incidentes"] for z in cacheadas] == [
        z["n_incidentes"] for z in recalculadas
    ]

