def test_health_reporta_datasets_cargados(client):
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["datasets"]["incidentes"] > 0
    assert body["datasets"]["manzanas_censales"] > 0
