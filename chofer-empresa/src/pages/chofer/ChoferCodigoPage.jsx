import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useChofer } from "../../context/ChoferContext";
import { mensajeError } from "../../services/choferApi";
import "../LoginPage.css";

export default function ChoferCodigoPage() {
  const { sesiones, agregarCodigo } = useChofer();
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await agregarCodigo(codigo);
      navigate("/chofer/servicios", { replace: true });
    } catch (err) {
      setError(
        err?.response?.status === 429
          ? "Demasiados intentos. Espera unos minutos y vuelve a probar."
          : mensajeError(err)
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card card" onSubmit={handleSubmit}>
        <h1>¿Eres chofer?</h1>
        <p className="subtitulo">
          Ingresa el código que te envió tu empresa para ver tu servicio. No necesitas cuenta.
        </p>

        <div className="campo">
          <label htmlFor="codigo">Código del servicio</label>
          <input
            id="codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Pega aquí el código"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>

        {error && <p className="texto-error">{error}</p>}

        <button type="submit" className="btn-primary" disabled={!codigo.trim() || enviando}>
          {enviando ? "Verificando…" : "Entrar"}
        </button>

        {sesiones.length > 0 && (
          <Link to="/chofer/servicios" className="btn-secondary btn-accion">
            Ya tengo servicios: ver mis servicios
          </Link>
        )}

        <p className="login-alternativa">
          <Link to="/login" className="enlace">
            Volver al ingreso de empresas
          </Link>
        </p>
      </form>
    </div>
  );
}