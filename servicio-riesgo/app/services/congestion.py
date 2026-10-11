"""Congestión por calle y por hora del día (Semana 6).

El flujo vehicular de SECTRA (`flujo_v_h`) es un cálculo del modelo de
transporte del Área Metropolitana: viene en escalones de ~1.111 veh/h (solo
7 valores distintos en toda Santiago) y es UN solo número por tramo, sin
hora. No se puede inventar más precisión que esa. Lo que sí se puede es:

1. Mostrar la congestión en niveles escalonados honestos (bajo/medio/alto)
   según el flujo, en vez de un número continuo que aparente una precisión
   que el dato no tiene.
2. Modular ese flujo por hora del día con un perfil típico de un día hábil
   (punta de mañana y de tarde vs. valle y noche). Este perfil es un
   SUPUESTO DE TRABAJO, no un dato de SECTRA: SECTRA no publica a qué hora
   corresponde el flujo de esta capa, así que se toma como la hora de máxima
   demanda (factor 1.0) y el resto del día baja respecto a ella. Siempre se
   avisa en la respuesta cuando la congestión es una estimación por hora.
"""

import numpy as np

# Factor (0-1) del flujo respecto de la hora punta, para las horas 0..23.
PERFIL_HORARIO = [
    0.25, 0.20, 0.20, 0.20, 0.25, 0.40,  # 00-05  madrugada
    0.70, 0.95, 1.00, 0.90, 0.75, 0.75,  # 06-11  punta de mañana
    0.80, 0.80, 0.75, 0.80, 0.90, 1.00,  # 12-17  mediodía y punta de tarde
    1.00, 0.90, 0.70, 0.55, 0.40, 0.30,  # 18-23  tarde-noche
]

# Umbrales sobre el flujo efectivo (veh/h). Los escalones de SECTRA son
# ~1.111 / 2.221 / 3.332 / 4.442 / 5.553 / 7.774 / 9.995: "bajo" es el escalón
# base (el 76 % de las calles de Santiago), "medio" 2.221-3.332 y "alto" desde
# 4.442 veh/h.
UMBRAL_MEDIO_VEH_H = 2000
UMBRAL_ALTO_VEH_H = 4000


def factor_horario(hora: int | None) -> float:
    """1.0 si no se pide hora (flujo SECTRA tal cual, sin modular)."""
    if hora is None:
        return 1.0
    return PERFIL_HORARIO[int(hora) % 24]


def niveles_congestion(flujo_efectivo) -> np.ndarray:
    flujo = np.asarray(flujo_efectivo, dtype=float)
    return np.where(
        flujo >= UMBRAL_ALTO_VEH_H,
        "alto",
        np.where(flujo >= UMBRAL_MEDIO_VEH_H, "medio", "bajo"),
    )
