"""E2E del flujo de la demo: "iniciar trabajo" -> polígono auto-calculado
-> consulta de riesgo (Anexo A del plan).

Simula lo que hacen los otros dos módulos: el frontend arma el polígono
con la posición GPS del camión (ruta + ancho del vehículo + conos), el
Backend lo reenvía tal cual a POST /score (mismo cuerpo que arma
backend/src/services/riskService.js) y lee `risk_score`,
`congestion_score` y `nivel` de la respuesta para decidir qué ve el
Operador en el dashboard.
"""

import time

from tests.poligonos_ruta import (
    BUFFER_RUTA_M,
    poligono_desde_linea,
    poligono_desde_ruta_recta,
)

CAMPOS_QUE_LEE_EL_BACKEND = {
    "risk_score",
    "congestion_score",
    "nivel",
    "n_incidentes_considerados",
    "tipo_actividad",
}


def _cuerpo_como_lo_manda_el_backend(poligono, fecha="2026-10-15", tipo="PROGRAMADA"):
    return {"poligono": poligono, "fecha": fecha, "tipo_actividad": tipo}


def test_flujo_iniciar_trabajo_respeta_el_contrato_del_backend(client):
    poligono = poligono_desde_ruta_recta(-33.460763, -70.667891, 150, 90)
    response = client.post("/score", json=_cuerpo_como_lo_manda_el_backend(poligono))

    assert response.status_code == 200
    body = response.json()
    assert CAMPOS_QUE_LEE_EL_BACKEND <= set(body)
    assert body["nivel"] in {"bajo", "medio", "alto"}
    assert 0 <= body["risk_score"] <= 100
    assert 0 <= body["congestion_score"] <= 100


def test_el_poligono_simulado_es_angosto_como_el_del_frontend():
    """Sanity check del helper: ~11 m de ancho (2 x 5.5 m), anillo cerrado."""
    poligono = poligono_desde_ruta_recta(-33.45, -70.65, 150, 90)
    anillo = poligono["coordinates"][0]
    assert anillo[0] == anillo[-1]
    latitudes = [lat for _, lat in anillo]
    ancho_m = (max(latitudes) - min(latitudes)) * 111_320
    assert abs(ancho_m - 2 * BUFFER_RUTA_M) < 0.5


def test_ruta_con_curva_tambien_se_evalua(client):
    ruta = [(-33.4608, -70.6690), (-33.4608, -70.6675), (-33.4600, -70.6668)]
    response = client.post(
        "/score", json=_cuerpo_como_lo_manda_el_backend(poligono_desde_linea(ruta))
    )
    assert response.status_code == 200


def test_camion_detenido_en_un_solo_punto_se_evalua(client):
    """Ruta de largo 0 (camión estacionado): la caja de conos alrededor de
    un único punto GPS."""
    poligono = poligono_desde_ruta_recta(-33.4608, -70.6679, 0, 0)
    response = client.post("/score", json=_cuerpo_como_lo_manda_el_backend(poligono))
    assert response.status_code == 200


def test_anillo_abierto_tambien_se_acepta(client):
    """La app envía el anillo abierto al Backend y éste lo cierra antes de
    consultarnos; por si llegara abierto igual, shapely lo cierra solo."""
    poligono = poligono_desde_ruta_recta(-33.4608, -70.6679, 150, 90)
    poligono["coordinates"][0] = poligono["coordinates"][0][:-1]
    response = client.post("/score", json=_cuerpo_como_lo_manda_el_backend(poligono))
    assert response.status_code == 200


def test_responde_en_tiempo_real(client):
    """El Backend nos llama con timeout de 5 s en cada "iniciar trabajo".
    Con los datasets ya en memoria una consulta debe tardar milisegundos;
    el umbral de 1 s deja margen de sobra para una máquina lenta."""
    poligono = poligono_desde_ruta_recta(-33.4608, -70.6679, 300, 45)
    cuerpo = _cuerpo_como_lo_manda_el_backend(poligono)
    client.post("/score", json=cuerpo)  # calienta

    inicio = time.perf_counter()
    for _ in range(20):
        assert client.post("/score", json=cuerpo).status_code == 200
    promedio = (time.perf_counter() - inicio) / 20

    assert promedio < 1.0
