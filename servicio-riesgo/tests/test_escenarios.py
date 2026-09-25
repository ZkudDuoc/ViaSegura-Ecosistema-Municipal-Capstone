"""Pruebas con distintos escenarios de riesgo (calibración) sobre rutas
como las que arma el frontend al presionar "iniciar trabajo".

Cada escenario es un camión de 150 m de ruta centrado en un incidente real
del dataset, evaluado para el 2026-10-15 (época de la demo). Salieron de
`python scripts/generar_escenarios_demo.py --fecha 2026-10-15`. Están
fijados a propósito: si alguien recalibra RISK_TAU / umbrales / buffer o
regenera el dataset y un nivel cambia, este test falla y obliga a
revisar el efecto (no son coordenadas mágicas, son regresión de
calibración).
"""

import pytest

from tests.poligonos_ruta import poligono_desde_ruta_recta

FECHA = "2026-10-15"
LARGO_M = 150
RUMBO = 90

# nombre: (lat, lon, nivel esperado, incidentes esperados, risk_score esperado)
ESCENARIOS = {
    "bajo": (-33.421799, -70.695054, "bajo", 1, 32.97),
    "medio": (-33.403018, -70.643878, "medio", 1, 55.07),
    "alto": (-33.460763, -70.667891, "alto", 2, 86.47),
    "sin_riesgo": (-33.4105, -70.6905, "bajo", 0, 0.0),
}


@pytest.mark.parametrize("nombre", list(ESCENARIOS))
def test_escenario_por_nivel(client, nombre):
    lat, lon, nivel, n_incidentes, risk_score = ESCENARIOS[nombre]
    response = client.post(
        "/score",
        json={
            "poligono": poligono_desde_ruta_recta(lat, lon, LARGO_M, RUMBO),
            "fecha": FECHA,
            "tipo_actividad": "PROGRAMADA",
        },
    )

    body = response.json()
    assert response.status_code == 200
    assert body["nivel"] == nivel
    assert body["n_incidentes_considerados"] == n_incidentes
    assert body["risk_score"] == pytest.approx(risk_score, abs=0.01)
