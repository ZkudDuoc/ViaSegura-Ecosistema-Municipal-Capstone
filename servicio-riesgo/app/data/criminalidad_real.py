"""Criminalidad real por comuna (Semana 5 — integración de la Parte B).

CEAD no tiene API REST (ver docs/investigacion-datos-riesgo-congestion.md),
así que estos valores son una **captura manual** del portal interactivo
real (https://cead.minsegpublica.gob.cl/estadisticas-delictuales/),
filtrando "Casos Policiales", las 7 familias de delito completas (no solo
un tipo), año 2025, tasa cada 100.000 habitantes — comparable entre
comunas de distinto tamaño de población.

Se capturaron las 10 comunas que se superponen con el bbox simulado del
proyecto (las mismas que aparecen como `comuna` en los tramos reales de
SECTRA, ver app/data/calles.py), no solo una: así se puede aplicar el
factor real correcto según en qué comuna cae cada calle, en vez de un
número plano para toda la zona.

**SANTIAGO** es la comuna con más volumen de datos reales del país —
78.902 casos policiales en 2025 (~4% del total nacional, en una sola
comuna) — lo que la hace la referencia más robusta y "útil desde ya" del
grupo, aunque Providencia tenga una tasa aún más alta.

Como no hay API, esta captura **no se actualiza sola** — para refrescarla
hay que volver a consultar el portal a mano y actualizar
CRIMINALIDAD_POR_COMUNA.
"""

from dataclasses import dataclass

TASA_NACIONAL_CADA_100K_2025 = 9_789.3
ANIO_DATOS = 2025
FUENTE = (
    "CEAD (cead.minsegpublica.gob.cl/estadisticas-delictuales), "
    "Casos Policiales, 7 familias de delito, tasa cada 100.000 habitantes"
)
FECHA_CAPTURA = "2026-10-01"
COMUNA_PRINCIPAL = "SANTIAGO"  # mayor volumen de datos reales del país


@dataclass(frozen=True)
class CriminalidadComuna:
    tasa_cada_100k: float
    frecuencia_total_casos: int | None = None

    @property
    def factor_relativo(self) -> float:
        """>1.0 = más delito que el promedio nacional, <1.0 = menos."""
        return round(self.tasa_cada_100k / TASA_NACIONAL_CADA_100K_2025, 4)


# Claves en MAYÚSCULAS sin tilde, igual que el campo `comuna` de SECTRA
# (ver app/data/calles.py) — así el cruce es directo, sin normalizar texto.
CRIMINALIDAD_POR_COMUNA: dict[str, CriminalidadComuna] = {
    "SANTIAGO": CriminalidadComuna(14_289.9, frecuencia_total_casos=78_902),
    "PROVIDENCIA": CriminalidadComuna(16_260.7),
    "ESTACION CENTRAL": CriminalidadComuna(11_324.2),
    "RECOLETA": CriminalidadComuna(10_478.5),
    "NUNOA": CriminalidadComuna(9_654.3),
    "VITACURA": CriminalidadComuna(8_311.7),
    "RENCA": CriminalidadComuna(8_286.4),
    "INDEPENDENCIA": CriminalidadComuna(8_185.4),
    "MACUL": CriminalidadComuna(8_693.7),
    "LAS CONDES": CriminalidadComuna(7_572.9),
}


def factor_para_comuna(comuna: str | None) -> float:
    """Factor relativo real para una comuna. 1.0 (neutro, sin sesgo) si la
    comuna no tiene dato capturado — SECTRA trae más comunas de las que
    se alcanzaron a capturar a mano (CERRILLOS, CONCHALI, PAC, QUINTA
    NORMAL, SAN JOAQUIN, SAN MIGUEL), y es mejor no aplicar ningún
    ajuste que inventar uno sin evidencia."""
    if not comuna:
        return 1.0
    dato = CRIMINALIDAD_POR_COMUNA.get(comuna.strip().upper())
    return dato.factor_relativo if dato else 1.0
