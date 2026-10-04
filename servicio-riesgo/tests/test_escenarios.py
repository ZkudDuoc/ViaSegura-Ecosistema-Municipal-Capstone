"""Pruebas con distintos escenarios de riesgo (calibración) sobre rutas
como las que arma el frontend al presionar "iniciar trabajo".

Cada escenario es un camión de 150 m de ruta centrado en un incidente real
del dataset, evaluado para el 2026-10-15 (época de la demo). Salieron de
`python scripts/generar_escenarios_demo.py --fecha 2026-10-15`. Están
fijados a propósito: si alguien recalibra RISK_TAU / umbrales / buffer o
regenera el dataset y un nivel cambia, este test falla y obliga a
revisar el efecto (no son coordenadas mágicas, son regresión de
calibración).

Historia de los valores:
- Semana 5: "medio" subió de 55.07 a 57.53 porque /score empezó a usar el
  factor de criminalidad real (CEAD) cuando hay una calle SECTRA cerca.
- Semana 6: /score suma además la exposición vial de las calles cercanas
  (CEAD repartido por flujo x largo, ver app/services/calles_riesgo.py) y
  RISK_TAU sube de 2.5 a 3.5 (ver scoring.py). Por eso:
  * "alto" baja de 86.47 a 76.03 (solo cambia TAU: no tiene calles cerca,
    así que la exposición no aplica);
  * el punto que antes era "bajo" (Quinta Normal) ahora es "medio" (38.58),
    porque se le suma la exposición de sus calles; el nuevo "bajo" es un
    punto en San Miguel (31.19), que sale de
    `python scripts/generar_escenarios_demo.py --fecha 2026-10-15`;
  * "sin_riesgo" ya no da exactamente 0.0 (6.69): sin incidentes, igual
    queda la línea base de exposición de las calles de Renca. Sigue siendo
    nivel "bajo".
"""

import pytest

from tests.poligonos_ruta import poligono_desde_ruta_recta

FECHA = "2026-10-15"
LARGO_M = 150
RUMBO = 90

# nombre: (lat, lon, nivel esperado, incidentes esperados, risk_score esperado)
ESCENARIOS = {
    "bajo": (-33.48859, -70.651381, "bajo", 1, 31.19),
    "medio": (-33.421799, -70.695054, "medio", 1, 38.58),
    "alto": (-33.460763, -70.667891, "alto", 2, 76.03),
    "sin_riesgo": (-33.4105, -70.6905, "bajo", 0, 6.69),
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
