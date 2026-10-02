import os
from pathlib import Path

from dotenv import load_dotenv

SERVICE_ROOT = Path(__file__).resolve().parent.parent

load_dotenv(SERVICE_ROOT / ".env")

INCIDENTS_DATASET_PATH = SERVICE_ROOT / os.getenv(
    "INCIDENTS_DATASET_PATH", "./data/incidentes_simulado.csv"
)
INE_CENSUS_DATA_PATH = SERVICE_ROOT / os.getenv(
    "INE_CENSUS_DATA_PATH", "./data/ine_manzanas.csv"
)
PORT = int(os.getenv("PORT", "8000"))

# Margen (metros) que se expande el polígono recibido antes de buscar
# incidentes/manzanas — ver scoring.py. 0 lo desactiva.
BUFFER_BUSQUEDA_M = float(os.getenv("BUFFER_BUSQUEDA_M", "75"))

# Ponderación por horario nocturno (Semana 5, Anexo B). El profesor no dio
# un criterio de "noche" — se documenta como supuesto: 20:00-06:00 (franja
# habitual de menor visibilidad y menor circulación de personas), con
# PESO_NOCTURNO como multiplicador de la suma de riesgo. Configurable sin
# tocar código; ver services/scoring.py para el detalle.
NOCHE_HORA_INICIO = int(os.getenv("NOCHE_HORA_INICIO", "20"))
NOCHE_HORA_FIN = int(os.getenv("NOCHE_HORA_FIN", "6"))
PESO_NOCTURNO = float(os.getenv("PESO_NOCTURNO", "1.3"))

# Ruta del dataset de calles reales (SECTRA) para el score por tramo.
CALLES_DATASET_PATH = SERVICE_ROOT / os.getenv(
    "CALLES_DATASET_PATH", "./data/calles_sectra.geojson"
)
