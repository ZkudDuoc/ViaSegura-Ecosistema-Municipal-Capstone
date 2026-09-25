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
