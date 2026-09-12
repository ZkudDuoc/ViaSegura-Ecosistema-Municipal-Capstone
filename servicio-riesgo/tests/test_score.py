# Polígono dentro del bbox de datos simulados (LAT_RANGE/LON_RANGE en
# app/data/incidents.py y censo.py), donde sabemos por inspección manual
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

# ~30m de lado: tamaño real de una solicitud puntual (ej. reparar un
# poste), centrado exactamente en la coordenada del incidente id=1 del
# dataset simulado (ver tests/conftest.py o data/incidentes_simulado.csv:
# lat=-33.452249, lon=-70.643358, fecha=2025-01-22). Más chico que
# AREA_MINIMA_M2, así que scoring.py le aplica el buffer mínimo antes de
# filtrar.
POLIGONO_CHICO_EN_ZONA_CON_HISTORIAL = {
    "type": "Polygon",
    "coordinates": [
        [
            [-70.6435, -33.4524],
            [-70.6432, -33.4524],
            [-70.6432, -33.4521],
            [-70.6435, -33.4521],
            [-70.6435, -33.4524],
        ]
    ],
}
FECHA_INCIDENTE_ID_1 = "2025-01-22"


def test_score_zona_con_historial_de_incidentes(client):
    response = client.post(
        "/score",
        json={
            "poligono": POLIGONO_CON_HISTORIAL,
            "fecha": "2025-05-15",
            "tipo_actividad": "PROGRAMADA",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["n_incidentes_considerados"] > 0
    assert body["risk_score"] > 0
    assert body["nivel"] in {"bajo", "medio", "alto"}
    assert body["tipo_actividad"] == "PROGRAMADA"


def test_score_zona_sin_datos_es_riesgo_bajo(client):
    response = client.post(
        "/score",
        json={
            "poligono": POLIGONO_SIN_DATOS,
            "fecha": "2025-05-15",
            "tipo_actividad": "PROGRAMADA",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["n_incidentes_considerados"] == 0
    assert body["risk_score"] == 0.0
    assert body["nivel"] == "bajo"


def test_score_acepta_emergencia(client):
    response = client.post(
        "/score",
        json={
            "poligono": POLIGONO_SIN_DATOS,
            "fecha": "2025-05-15",
            "tipo_actividad": "EMERGENCIA",
        },
    )

    assert response.status_code == 200
    assert response.json()["tipo_actividad"] == "EMERGENCIA"


def test_score_rechaza_tipo_actividad_invalido(client):
    response = client.post(
        "/score",
        json={
            "poligono": POLIGONO_SIN_DATOS,
            "fecha": "2025-05-15",
            "tipo_actividad": "carga_general",
        },
    )

    assert response.status_code == 422


def test_score_poligono_chico_usa_buffer_minimo(client):
    """Un polígono realista de ~20m no debería dar 0 incidentes solo por
    ser chico, si está en una zona con historial conocido — el buffer
    mínimo de scoring.py debe expandirlo antes de filtrar."""
    response = client.post(
        "/score",
        json={
            "poligono": POLIGONO_CHICO_EN_ZONA_CON_HISTORIAL,
            "fecha": FECHA_INCIDENTE_ID_1,
            "tipo_actividad": "PROGRAMADA",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["buffer_aplicado_m"] > 0
    assert body["n_incidentes_considerados"] > 0


def test_score_poligono_grande_no_usa_buffer(client):
    response = client.post(
        "/score",
        json={
            "poligono": POLIGONO_CON_HISTORIAL,
            "fecha": "2025-05-15",
            "tipo_actividad": "PROGRAMADA",
        },
    )

    assert response.json()["buffer_aplicado_m"] == 0.0


def test_score_rechaza_poligono_invalido(client):
    response = client.post(
        "/score",
        json={
            "poligono": {"type": "Polygon", "coordinates": [[[0, 0], [1, 1]]]},
            "fecha": "2025-05-15",
            "tipo_actividad": "PROGRAMADA",
        },
    )

    assert response.status_code == 400


def test_score_rechaza_payload_incompleto(client):
    response = client.post("/score", json={"fecha": "2025-05-15"})

    assert response.status_code == 422
