"""Ponderación nocturna (Semana 5, Anexo B): "si la ventana cae de noche,
el peso debe ser mayor". Valores verificados corriendo calcular_score
directo (ver conversación de Semana 5) con el dataset real del repo."""

import pytest

from app import config
from tests.poligonos_ruta import poligono_desde_ruta_recta

FECHA = "2026-10-15"
POLIGONO_ALTO = poligono_desde_ruta_recta(-33.460763, -70.667891, 150, 90)
POLIGONO_BAJO = poligono_desde_ruta_recta(-33.421799, -70.695054, 150, 90)


def _score(client, poligono, hora_inicio):
    return client.post(
        "/score",
        json={
            "poligono": poligono,
            "fecha": FECHA,
            "tipo_actividad": "PROGRAMADA",
            "hora_inicio": hora_inicio,
        },
    ).json()


def test_de_dia_no_aplica_peso_nocturno(client):
    body = _score(client, POLIGONO_ALTO, 12)
    assert body["risk_score"] == pytest.approx(86.47, abs=0.01)
    assert body["explicacion"]["franja_horaria"] == "dia"


def test_de_noche_sube_el_risk_score(client):
    body = _score(client, POLIGONO_ALTO, 23)
    assert body["risk_score"] == pytest.approx(92.57, abs=0.01)
    assert body["explicacion"]["franja_horaria"] == "noche"
    assert body["explicacion"]["peso_nocturno_aplicado"] is True
    assert f"{config.PESO_NOCTURNO}" or "nocturno" in body["explicacion"]["resumen"].lower()


def test_la_noche_puede_cambiar_el_nivel_de_bajo_a_medio(client):
    """Mismo polígono, misma fecha: de día da 'bajo', de noche cruza a
    'medio' — demuestra que el peso nocturno puede cambiar la decisión
    del operador, no solo mover el número."""
    de_dia = _score(client, POLIGONO_BAJO, 10)
    de_noche = _score(client, POLIGONO_BAJO, 1)

    assert de_dia["nivel"] == "bajo"
    assert de_noche["nivel"] == "medio"
    assert de_noche["risk_score"] > de_dia["risk_score"]


@pytest.mark.parametrize("hora", [20, 23, 0, 5])
def test_horas_dentro_del_rango_nocturno_configurado(client, hora):
    body = _score(client, POLIGONO_ALTO, hora)
    assert body["explicacion"]["franja_horaria"] == "noche"


@pytest.mark.parametrize("hora", [6, 10, 15, 19])
def test_horas_fuera_del_rango_nocturno_configurado(client, hora):
    body = _score(client, POLIGONO_ALTO, hora)
    assert body["explicacion"]["franja_horaria"] == "dia"


def test_hora_fuera_de_rango_valido_es_rechazada(client):
    response = client.post(
        "/score",
        json={
            "poligono": POLIGONO_ALTO,
            "fecha": FECHA,
            "tipo_actividad": "PROGRAMADA",
            "hora_inicio": 24,
        },
    )
    assert response.status_code == 422
