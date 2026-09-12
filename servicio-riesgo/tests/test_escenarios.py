"""Pruebas con distintos escenarios de riesgo (Semana 3, calibración).

El plan pide explícitamente probar los 3 niveles de riesgo por separado.
Los polígonos de este archivo se encontraron corriendo escenarios
aleatorios sobre el dataset real (ver scripts/calibrar_parametros.py) y
verificando a mano que cada uno cae en el nivel esperado con las
constantes ya calibradas — si algún día se recalibra de nuevo, hay que
volver a buscarlos (no son coordenadas mágicas, son solo ejemplos reales
que hoy dan ese resultado).
"""

POLIGONO_UN_INCIDENTE = {
    "type": "Polygon",
    "coordinates": [
        [
            [-70.6771, -33.4378],
            [-70.6697, -33.4378],
            [-70.6697, -33.4304],
            [-70.6771, -33.4304],
            [-70.6771, -33.4378],
        ]
    ],
}

POLIGONO_DOS_INCIDENTES = {
    "type": "Polygon",
    "coordinates": [
        [
            [-70.6855, -33.4794],
            [-70.6745, -33.4794],
            [-70.6745, -33.4684],
            [-70.6855, -33.4684],
            [-70.6855, -33.4794],
        ]
    ],
}

POLIGONO_TRES_INCIDENTES = {
    "type": "Polygon",
    "coordinates": [
        [
            [-70.6251, -33.4709],
            [-70.6125, -33.4709],
            [-70.6125, -33.4583],
            [-70.6251, -33.4583],
            [-70.6251, -33.4709],
        ]
    ],
}

FECHA = "2025-05-15"
TIPO = "PROGRAMADA"


def test_escenario_riesgo_bajo(client):
    response = client.post(
        "/score",
        json={"poligono": POLIGONO_UN_INCIDENTE, "fecha": FECHA, "tipo_actividad": TIPO},
    )
    body = response.json()
    assert body["nivel"] == "bajo"
    assert body["n_incidentes_considerados"] == 1


def test_escenario_riesgo_medio(client):
    response = client.post(
        "/score",
        json={"poligono": POLIGONO_DOS_INCIDENTES, "fecha": FECHA, "tipo_actividad": TIPO},
    )
    body = response.json()
    assert body["nivel"] == "medio"
    assert body["n_incidentes_considerados"] == 2


def test_escenario_riesgo_alto(client):
    response = client.post(
        "/score",
        json={"poligono": POLIGONO_TRES_INCIDENTES, "fecha": FECHA, "tipo_actividad": TIPO},
    )
    body = response.json()
    assert body["nivel"] == "alto"
    assert body["n_incidentes_considerados"] >= 3
