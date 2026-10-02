import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useChofer } from "../../context/ChoferContext";
import { obtenerServicio, iniciarServicio, mensajeError } from "../../services/choferApi";
import { obtenerPosicion, estaEnArea } from "../../utils/geo";
import { comprimirFoto } from "../../utils/foto";
import "../paginas.css";
import "./chofer.css";

// Iniciar el trabajo: el GPS verifica que el chofer esté en el área y se
// envía la foto de evidencia de la faena. Solo desde el servicio actual.
export default function ChoferEvidenciaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tokenDe } = useChofer();
  const token = tokenDe(id);

  const [servicio, setServicio] = useState(null);
  const [verificacion, setVerificacion] = useState(null);
  const [ubicando, setUbicando] = useState(false);
  const [foto, setFoto] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    obtenerServicio(id, token)
      .then(setServicio)
      .catch((err) => setError(mensajeError(err)));
  }, [id, token]);

  if (!token) {
    return (
      <div className="chofer-contenido">
        <p className="texto-error">Este servicio no está en tu dispositivo.</p>
        <Link to="/chofer" className="enlace">
          Ingresar código
        </Link>
      </div>
    );
  }

  const verificar = async () => {
    setError(null);
    setUbicando(true);
    try {
      const posicion = await obtenerPosicion();
      setVerificacion(estaEnArea(posicion, servicio.area));
    } catch (err) {
      setError(err.message);
    } finally {
      setUbicando(false);
    }
  };

  const tomarFoto = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setError(null);
    try {
      setFoto(await comprimirFoto(archivo));
    } catch (err) {
      setError(err.message);
    }
  };

  const confirmar = async () => {
    setError(null);
    setEnviando(true);
    try {
      await iniciarServicio(id, token, foto);
      navigate("/chofer/servicios", { replace: true });
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="chofer-contenido">
      <Link to="/chofer/servicios" className="enlace">
        ← Mis servicios
      </Link>
      <h1>Iniciar trabajo</h1>
      <p className="subtitulo">Verifica que estás en el lugar y toma una foto de la faena.</p>

      {!servicio && !error && <p className="subtitulo">Cargando…</p>}

      {servicio && (
        <>
          <section className="card paso">
            <h2 className="paso-titulo">1. Ubicación</h2>
            {verificacion &&
              (verificacion.dentro ? (
                <p className="texto-exito">Estás dentro del área de trabajo</p>
              ) : (
                <p className="texto-error">
                  Estás a {Math.round(verificacion.distanciaM)} m del área. Acércate e intenta de nuevo.
                </p>
              ))}
            <button type="button" className="btn-secondary" onClick={verificar} disabled={ubicando}>
              {ubicando ? "Obteniendo ubicación…" : verificacion ? "Verificar de nuevo" : "Verificar mi ubicación"}
            </button>
          </section>

          <section className="card paso">
            <h2 className="paso-titulo">2. Foto de evidencia</h2>
            {foto && <img src={foto} alt="Foto de evidencia" className="foto-preview" />}
            <label className="btn-secondary btn-archivo">
              {foto ? "Tomar otra foto" : "Abrir cámara"}
              <input type="file" accept="image/*" capture="environment" onChange={tomarFoto} hidden />
            </label>
          </section>

          <button
            type="button"
            className="btn-primary"
            onClick={confirmar}
            disabled={!verificacion?.dentro || !foto || enviando}
          >
            {enviando ? "Enviando…" : "Iniciar trabajo"}
          </button>
        </>
      )}

      {error && <p className="texto-error">{error}</p>}
    </div>
  );
}