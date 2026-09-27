import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { listarPermisos } from "../services/permisoService";
import { getApiErrorMessage } from "../services/api";
import { extraerIdPermiso, esCodigoCorto } from "../utils/qr";
import "./paginas.css";
import "./supervisor.css";

const ID_LECTOR = "lector-qr";

export default function EscanearPage() {
  const navigate = useNavigate();
  const lectorRef = useRef(null);
  const [escaneando, setEscaneando] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(null);

  const detener = async () => {
    const lector = lectorRef.current;
    lectorRef.current = null;
    setEscaneando(false);
    if (!lector) return;
    try {
      await lector.stop();
      lector.clear();
    } catch {
      // Ya estaba detenido.
    }
  };

  // Apagar la cámara al salir de la página.
  useEffect(() => () => {
    detener();
  }, []);

  const abrirPermiso = (id) => navigate(`/permisos/${id}`);

  const alLeerQr = (texto) => {
    // La librería puede disparar varias lecturas antes de detenerse.
    if (!lectorRef.current) return;
    detener();
    const id = extraerIdPermiso(texto);
    if (id) abrirPermiso(id);
    else setError("El código escaneado no es un QR de permiso de VíaSegura");
  };

  const iniciar = async () => {
    setError(null);
    const lector = new Html5Qrcode(ID_LECTOR);
    lectorRef.current = lector;
    try {
      await lector.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        alLeerQr,
        () => {} // Frames sin QR: se ignoran.
      );
      setEscaneando(true);
    } catch {
      lectorRef.current = null;
      setError("No se pudo abrir la cámara. Revisa que la app tenga permiso para usarla.");
    }
  };

  const buscarManual = async (e) => {
    e.preventDefault();
    setError(null);

    const id = extraerIdPermiso(codigo);
    if (id) {
      abrirPermiso(id);
      return;
    }
    if (!esCodigoCorto(codigo)) {
      setError("Ingresa el código de 8 caracteres que aparece bajo el QR del chofer");
      return;
    }

    setBuscando(true);
    try {
      const permisos = await listarPermisos();
      const encontrado = permisos.find((p) => p.id.startsWith(codigo.trim().toLowerCase()));
      if (encontrado) abrirPermiso(encontrado.id);
      else setError("No se encontró un permiso de tu comuna con ese código");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div>
      <h1>Escanear permiso</h1>
      <p className="subtitulo">Escanea el QR que muestra el chofer para revisar su permiso.</p>

      <div id={ID_LECTOR} className={"lector" + (escaneando ? " activo" : "")} />

      {escaneando ? (
        <button type="button" className="btn-secondary" onClick={detener}>
          Cancelar
        </button>
      ) : (
        <button type="button" className="btn-primary" onClick={iniciar}>
          Escanear QR
        </button>
      )}

      <form className="card paso busqueda-manual" onSubmit={buscarManual}>
        <h2 className="paso-titulo">¿No se puede escanear?</h2>
        <div className="campo">
          <label htmlFor="codigo">Código del permiso</label>
          <input
            id="codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Ej: 40E89955"
            autoCapitalize="characters"
            autoComplete="off"
          />
        </div>
        <button type="submit" className="btn-secondary" disabled={!codigo.trim() || buscando}>
          {buscando ? "Buscando…" : "Buscar permiso"}
        </button>
      </form>

      {error && <p className="texto-error">{error}</p>}
    </div>
  );
}