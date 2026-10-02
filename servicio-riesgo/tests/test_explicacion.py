"""Score explicado (Semana 5, Anexo B): el detalle del dashboard necesita
poder mostrarle al operador, en texto simple, por qué salió ese nivel."""

from tests.poligonos_ruta import poligono_desde_ruta_recta

FECHA = "2026-10-15"

POLIGONO_ALTO = poligono_desde_ruta_recta(-33.460763, -70.667891, 150, 90)
POLIGONO_SIN_DATOS = poligono_desde_ruta_recta(-33.4105, -70.6905, 150, 90)


def _pedir(client, poligono, hora_inicio=None):
    cuerpo = {"poligono": poligono, "fecha": FECHA, "tipo_actividad": "PROGRAMADA"}
    if hora_inicio is not None:
        cuerpo["hora_inicio"] = hora_inicio
    return client.post("/score", json=cuerpo)


def test_explicacion_lista_los_incidentes_que_contaron(client):
    body = _pedir(client, POLIGONO_ALTO).json()
    explicacion = body["explicacion"]

    assert len(explicacion["incidentes_considerados"]) == body["n_incidentes_considerados"]
    for incidente in explicacion["incidentes_considerados"]:
        assert set(incidente) == {"tipo_incidente", "gravedad", "fecha"}
        assert incidente["gravedad"] in {"baja", "media", "alta"}


def test_explicacion_resumen_es_texto_no_vacio(client):
    body = _pedir(client, POLIGONO_ALTO).json()
    assert isinstance(body["explicacion"]["resumen"], str)
    assert len(body["explicacion"]["resumen"]) > 10


def test_explicacion_sin_incidentes_lo_dice_explicitamente(client):
    body = _pedir(client, POLIGONO_SIN_DATOS).json()
    explicacion = body["explicacion"]
    assert explicacion["incidentes_considerados"] == []
    assert "no se encontraron" in explicacion["resumen"].lower()


def test_explicacion_franja_horaria_de_dia_por_defecto(client):
    body = _pedir(client, POLIGONO_ALTO).json()
    assert body["explicacion"]["franja_horaria"] == "dia"
    assert body["explicacion"]["peso_nocturno_aplicado"] is False
