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
