from app import config
from tests.poligonos_ruta import poligono_desde_ruta_recta

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


def test_score_poligono_diminuto_encuentra_incidente_gracias_al_buffer(
    client, incidente_ejemplo
):
    """Un polígono de ~20 m centrado en un incidente real de fecha
    conocida no debe dar 0 solo por ser chico: el margen de búsqueda
    (BUFFER_BUSQUEDA_M) lo expande antes de filtrar."""
    lat, lon = incidente_ejemplo.latitud, incidente_ejemplo.longitud
    d = 0.0001  # ~10 m a cada lado
    poligono = {
        "type": "Polygon",
        "coordinates": [
            [
                [lon - d, lat - d],
                [lon + d, lat - d],
                [lon + d, lat + d],
                [lon - d, lat + d],
                [lon - d, lat - d],
            ]
        ],
    }
    response = client.post(
        "/score",
        json={
            "poligono": poligono,
            "fecha": incidente_ejemplo.fecha.date().isoformat(),
            "tipo_actividad": "PROGRAMADA",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["n_incidentes_considerados"] >= 1
    assert body["risk_score"] > 0


def test_score_expone_el_buffer_configurado_en_todas_las_solicitudes(client):
    """El margen se aplica siempre (no solo a polígonos chicos): así una
    ruta más larga nunca da menos riesgo que una más corta contenida en
    ella. La respuesta lo informa para trazabilidad."""
    for poligono in (POLIGONO_CON_HISTORIAL, POLIGONO_SIN_DATOS):
        response = client.post(
            "/score",
            json={"poligono": poligono, "fecha": "2025-05-15", "tipo_actividad": "PROGRAMADA"},
        )
        assert response.json()["buffer_aplicado_m"] == config.BUFFER_BUSQUEDA_M


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


def test_score_usa_criminalidad_real_cuando_hay_calle_real_cerca(client):
    """Recoleta tiene factor real capturado (CEAD, sobre el promedio
    nacional) -- /score debe detectarlo igual que /ranking-inspecciones."""
    poligono = poligono_desde_ruta_recta(-33.403018, -70.643878, 150, 90)
    response = client.post(
        "/score",
        json={"poligono": poligono, "fecha": "2026-10-15", "tipo_actividad": "PROGRAMADA"},
    )

    body = response.json()
    assert body["comuna_detectada"] == "RECOLETA"
    assert body["fuente_congestion"].startswith("real")
    assert "Recoleta" in body["explicacion"]["resumen"]


def test_score_sin_calle_real_cerca_usa_estimacion(client):
    poligono = poligono_desde_ruta_recta(-33.460763, -70.667891, 150, 90)
    response = client.post(
        "/score",
        json={"poligono": poligono, "fecha": "2026-10-15", "tipo_actividad": "PROGRAMADA"},
    )

    body = response.json()
    assert body["comuna_detectada"] is None
    assert body["fuente_congestion"] == "estimada (densidad poblacional simulada)"
