import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listarPermisos, activarPermiso } from "../services/permisoService";
import { getApiErrorMessage } from "../services/api";
import { obtenerPosicion, estaEnArea } from "../utils/geo";
import { comprimirFoto } from "../utils/foto";
import { ESTADO_LABEL } from "../utils/formato";
import "./paginas.css";

export default function LlegadaPage() {
  const { id } = useParams();
  const [permiso, setPermiso] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [verificacion, setVerificacion] = useState(null);
  const [ubicando, setUbicando] = useState(false);
  const [foto, setFoto] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [error, setError] = useState(null);

  // No hay GET /permisos/:id: se busca dentro de la lista del chofer.
  useEffect(() => {
    listarPermisos()
      .then((lista) => setPermiso(lista.find((p) => p.id === id) ?? null))
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setCargando(false));
  }, [id]);

  const handleVerificar = async () => {
    setError(null);
    setUbicando(true);
    try {
      const posicion = await obtenerPosicion();
      setVerificacion(estaEnArea(posicion, permiso.area));
    } catch (err) {
      setError(err.message);
    } finally {
      setUbicando(false);
    }
  };

  const handleFoto = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setError(null);
    try {
      setFoto(await comprimirFoto(archivo));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleConfirmar = async () => {
    setError(null);
    setEnviando(true);
    try {
      await activarPermiso(id, foto);
      setConfirmado(true);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) return <p className="subtitulo">Cargando…</p>;

  if (!permiso) {
    return (
      <div>
        <h1>Confirmar llegada</h1>
        <p className="texto-error">{error ?? "No se encontró la solicitud"}</p>
        <Link to="/" className="enlace">Volver a mis solicitudes</Link>
      </div>
    );
  }

  if (confirmado) {
    return (
      <div className="card">
        <h1>Llegada confirmada</h1>
        <p className="texto-exito">Tu permiso está en operativo.</p>
        <Link to="/" className="btn-primary btn-accion">Volver a mis solicitudes</Link>
      </div>
    );
  }

  if (permiso.estado !== "APROBADO") {
    return (
      <div>
        <h1>Confirmar llegada</h1>
        <p className="subtitulo">
          Esta solicitud está "{ESTADO_LABEL[permiso.estado] ?? permiso.estado}". Solo se puede confirmar la
          llegada de solicitudes aprobadas.
        </p>
        <Link to="/" className="enlace">Volver a mis solicitudes</Link>
      </div>
    );
  }

  return (
    <div>
      <h1>Confirmar llegada</h1>
      <p className="subtitulo">Verifica que estás en el área de trabajo y toma una foto de evidencia.</p>

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
        <button type="button" className="btn-secondary" onClick={handleVerificar} disabled={ubicando}>
          {ubicando ? "Obteniendo ubicación…" : verificacion ? "Verificar de nuevo" : "📍 Verificar mi ubicación"}
        </button>
      </section>

      <section className="card paso">
        <h2 className="paso-titulo">2. Foto de evidencia</h2>
        {foto && <img src={foto} alt="Foto de evidencia" className="foto-preview" />}
        <label className="btn-secondary btn-archivo">
          {foto ? "Tomar otra foto" : "📷 Tomar foto"}
          <input type="file" accept="image/*" capture="environment" onChange={handleFoto} hidden />
        </label>
      </section>

      {error && <p className="texto-error">{error}</p>}

      <button
        type="button"
        className="btn-primary"
        onClick={handleConfirmar}
        disabled={!verificacion?.dentro || !foto || enviando}
      >
        {enviando ? "Confirmando…" : "Confirmar llegada"}
      </button>
    </div>
  );
}