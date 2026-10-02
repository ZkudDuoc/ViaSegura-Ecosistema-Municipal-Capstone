def test_health_reporta_datasets_cargados(client):
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["datasets"]["incidentes"] > 0
    assert body["datasets"]["manzanas_censales"] > 0
    assert body["datasets"]["tramos_calle"] > 0


def test_health_informa_el_origen_de_las_calles(client):
    """["sectra_real"] si SECTRA respondió al arrancar, ["simulado_respaldo"]
    si no — para poder detectar en producción si el servicio está
    corriendo con la red de calles real o con el respaldo simulado."""
    body = client.get("/health").json()
    origen = body["datasets"]["tramos_calle_origen"]

    assert origen in (["sectra_real"], ["simulado_respaldo"])
