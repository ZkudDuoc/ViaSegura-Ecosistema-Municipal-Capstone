import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { listarPermisos, verificarQr } from "../services/permisoService";
import { getApiErrorMessage } from "../services/api";
import { esCodigoCorto } from "../utils/qr";
import { leerRecientes } from "../utils/recientes";
import "./paginas.css";
import "./supervisor.css";

const ID_LECTOR = "lector-qr";

function haceCuanto(ms) {
  const minutos = Math.round((Date.now() - ms) / 60000);
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  return `hace ${Math.floor(minutos / 60)} h`;
}

export default function EscanearPage() {
  const navigate = useNavigate();
  const lectorRef = useRef(null);
  const [escaneando, setEscaneando] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(null);
  const [recientes] = useState(leerRecientes);

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

  // Semana 5: el QR ya no trae el id crudo, trae un token firmado — hay que
  // validarlo contra el Backend (firma + expiración) antes de mostrar nada.
  const alLeerQr = (texto) => {
    // La librería puede disparar varias lecturas antes de detenerse.
    if (!lectorRef.current) return;
    detener();
    verificarToken(texto.trim());
  };

  const verificarToken = async (token) => {
    setError(null);
    setBuscando(true);
    try {
      const detalle = await verificarQr(token);
      abrirPermiso(detalle.id);
    } catch (err) {
      setError(
        err?.response?.status === 400
          ? "El código escaneado no es un QR de permiso de VíaSegura válido (o ya expiró)"
          : getApiErrorMessage(err)
      );
    } finally {
      setBuscando(false);
    }
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

      {recientes.length > 0 && !escaneando && (
        <section className="card paso recientes">
          <h2 className="paso-titulo">Revisados recientemente</h2>
          <ul className="recientes-lista">
            {recientes.map((r) => (
              <li key={r.id}>
                <Link to={`/permisos/${r.id}`} className="reciente-item">
                  <span className="reciente-codigo">{r.id.slice(0, 8).toUpperCase()}</span>
                  <span className="reciente-info">
                    {r.empresa ?? "Persona natural"} · {r.rut}
                  </span>
                  <span className="reciente-tiempo">{haceCuanto(r.revisadoEn)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
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