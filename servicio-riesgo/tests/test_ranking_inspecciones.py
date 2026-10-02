"""POST /ranking-inspecciones (Semana 5, Anexo B, prioridad P2)."""

from shapely.geometry import shape

from tests.poligonos_ruta import poligono_desde_ruta_recta

FECHA = "2026-10-15"
POLIGONO_ALTO = poligono_desde_ruta_recta(-33.460763, -70.667891, 150, 90)
POLIGONO_BAJO = poligono_desde_ruta_recta(-33.421799, -70.695054, 150, 90)
POLIGONO_SIN_DATOS = poligono_desde_ruta_recta(-33.4105, -70.6905, 150, 90)


def _obra(id_, poligono, emergencia_activa=False):
    return {
        "id": id_,
        "poligono": poligono,
        "fecha": FECHA,
        "tipo_actividad": "PROGRAMADA",
        "emergencia_activa": emergencia_activa,
    }


def test_rankea_de_mayor_a_menor_prioridad(client):
    obras = [_obra("sin-datos", POLIGONO_SIN_DATOS), _obra("alto", POLIGONO_ALTO), _obra("bajo", POLIGONO_BAJO)]
    response = client.post("/ranking-inspecciones", json={"obras": obras})

    body = response.json()
    assert response.status_code == 200
    assert body["total"] == 3
    assert [o["id"] for o in body["ranking"]] == ["alto", "bajo", "sin-datos"]
    prioridades = [o["prioridad_score"] for o in body["ranking"]]
    assert prioridades == sorted(prioridades, reverse=True)


def test_emergencia_activa_siempre_va_primero(client):
    """Aunque su riesgo/congestión sean bajos, una obra con emergencia
    activa (ej. botón de pánico) se visita antes que cualquier otra."""
    obras = [
        _obra("sin-emergencia-alto-riesgo", POLIGONO_ALTO, emergencia_activa=False),
        _obra("con-emergencia-bajo-riesgo", POLIGONO_SIN_DATOS, emergencia_activa=True),
    ]
    response = client.post("/ranking-inspecciones", json={"obras": obras})

    ranking = response.json()["ranking"]
    assert ranking[0]["id"] == "con-emergencia-bajo-riesgo"
    assert ranking[0]["emergencia_activa"] is True
    assert "emergencia" in ranking[0]["motivo"].lower()


def test_poligono_invalido_no_rompe_el_ranking_completo(client):
    obras = [
        _obra("valida", POLIGONO_ALTO),
        {
            "id": "invalida",
            "poligono": {"type": "Polygon", "coordinates": [[[0, 0], [1, 1]]]},
            "fecha": FECHA,
            "tipo_actividad": "PROGRAMADA",
            "emergencia_activa": False,
        },
    ]
    response = client.post("/ranking-inspecciones", json={"obras": obras})

    assert response.status_code == 200
    ids = {o["id"] for o in response.json()["ranking"]}
    assert ids == {"valida", "invalida"}
    invalida = next(o for o in response.json()["ranking"] if o["id"] == "invalida")
    assert invalida["risk_score"] == 0.0


def test_lista_vacia_de_obras(client):
    response = client.post("/ranking-inspecciones", json={"obras": []})
    assert response.status_code == 200
    assert response.json() == {"total": 0, "ranking": []}


def test_obra_cerca_de_calle_real_usa_congestion_real(client):
    """Cerca de Quinta Normal: hay calles SECTRA reales (sin dato de CEAD
    capturado -> comuna detectada pero factor neutro)."""
    poligono = poligono_desde_ruta_recta(-33.421799, -70.695054, 150, 90)
    response = client.post("/ranking-inspecciones", json={"obras": [_obra("quinta-normal", poligono)]})

    obra = response.json()["ranking"][0]
    assert obra["comuna_detectada"] == "QUINTA NORMAL"
    assert obra["fuente_congestion"].startswith("real")


def test_obra_lejos_de_toda_calle_real_usa_estimacion(client):
    """POLIGONO_ALTO no tiene ninguna calle SECTRA cerca (verificado): debe
    caer al proxy de densidad poblacional, igual que /score."""
    response = client.post("/ranking-inspecciones", json={"obras": [_obra("sin-calle-real", POLIGONO_ALTO)]})

    obra = response.json()["ranking"][0]
    assert obra["comuna_detectada"] is None
    assert obra["fuente_congestion"] == "estimada (densidad poblacional simulada)"


def test_comuna_con_dato_real_de_criminalidad_cambia_el_risk_score(client):
    """Renca tiene factor real capturado (bajo el promedio nacional) --
    comparamos el risk_score del ranking contra calcular_score aplicando
    ese mismo factor a mano, para confirmar que se usa de verdad, no solo
    se informa en la respuesta."""
    from datetime import date

    from app.data.criminalidad_real import factor_para_comuna
    from app.services.scoring import calcular_score

    poligono = poligono_desde_ruta_recta(-33.4105, -70.6905, 150, 90)
    response = client.post("/ranking-inspecciones", json={"obras": [_obra("renca", poligono)]})
    obra = response.json()["ranking"][0]
    assert obra["comuna_detectada"] == "RENCA"

    factor_real = factor_para_comuna("RENCA")
    assert factor_real != 1.0

    esperado = calcular_score(
        client.app.state.incidents_gdf,
        client.app.state.census,
        shape(poligono),
        date(2026, 10, 15),
        factor_criminalidad=factor_real,
    )
    assert obra["risk_score"] == esperado["risk_score"]
