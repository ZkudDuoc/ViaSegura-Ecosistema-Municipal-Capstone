import pytest
from fastapi.testclient import TestClient

from app import config
from app.data.incidents import cargar_incidentes
from app.main import app


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def incidente_ejemplo():
    """Primer incidente limpio del dataset: sus coordenadas y su fecha
    reales, para armar polígonos de prueba que sabemos que deben
    encontrarlo (no dependen de coordenadas escritas a mano, así el test
    sigue válido si se regenera el dataset)."""
    return cargar_incidentes(config.INCIDENTS_DATASET_PATH).iloc[0]
