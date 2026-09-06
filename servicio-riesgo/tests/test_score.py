# Polígono dentro del bbox de datos simulados (LAT_RANGE/LON_RANGE en
# app/data/incidents.py y census.py), donde sabemos por inspección manual
# que hay historial de incidentes real dentro del dataset generado.
POLIGONO_CON_HISTORIAL = {
    "type": "Polygon",
    "coordinates": [
        [
            [-70.665, -33.465],
            [-70.650, -33.465],
            [-70.650, -33.450],
            [-70.665, -33.450],
            [-70.665, -33.465],
        ]
    ],
}

# Fuera del bbox de ambos datasets simulados: no debería haber incidentes
# ni manzanas censales que intersecten.
POLIGONO_SIN_DATOS = {
    "type": "Polygon",
    "coordinates": [
        [
            [-70.30, -33.10],
            [-70.29, -33.10],
            [-70.29, -33.09],
            [-70.30, -33.09],
            [-70.30, -33.10],
        ]
    ],
}


def test_score_zona_con_historial_de_incidentes(client):
    response = client.post(
        "/score",
        json={
            "poligono": POLIGONO_CON_HISTORIAL,
            "fecha": "2025-05-15",
            "tipo_actividad": "carga_general",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["n_incidentes_considerados"] > 0
    assert body["risk_score"] > 0
    assert body["nivel"] in {"bajo", "medio", "alto"}
    assert body["tipo_actividad"] == "carga_general"


def test_score_zona_sin_datos_es_riesgo_bajo(client):
    response = client.post(
        "/score",
        json={
            "poligono": POLIGONO_SIN_DATOS,
            "fecha": "2025-05-15",
            "tipo_actividad": "carga_general",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["n_incidentes_considerados"] == 0
    assert body["risk_score"] == 0.0
    assert body["nivel"] == "bajo"


def test_score_rechaza_poligono_invalido(client):
    response = client.post(
        "/score",
        json={
            "poligono": {"type": "Polygon", "coordinates": [[[0, 0], [1, 1]]]},
            "fecha": "2025-05-15",
            "tipo_actividad": "carga_general",
        },
    )

    assert response.status_code == 400


def test_score_rechaza_payload_incompleto(client):
    response = client.post("/score", json={"fecha": "2025-05-15"})

    assert response.status_code == 422
