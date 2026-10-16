import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useChofer } from "../../context/ChoferContext";
import { mensajeError } from "../../services/choferApi";
import PantallaAcceso from "../../components/PantallaAcceso";

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
    <PantallaAcceso
      titulo="Tu servicio en la mano, sin crear cuenta"
      descripcion="Con el código que te mandó tu empresa ves el permiso, envías la foto de inicio y tienes el botón de pánico."
      puntos={["Muestra el QR al supervisor", "Envía la evidencia al llegar", "Pide ayuda con un toque"]}
    >
      <form className="acceso-form" onSubmit={handleSubmit}>
        <h1>¿Eres chofer?</h1>
        <p className="acceso-ayuda">
          Ingresa el código que te envió tu empresa para ver tu servicio. No necesitas cuenta.
        </p>

        <div className="acceso-campo">
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

        {error && (
          <p className="acceso-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="acceso-boton" disabled={!codigo.trim() || enviando}>
          {enviando ? "Verificando…" : "Entrar"}
        </button>

        {sesiones.length > 0 && (
          <Link to="/chofer/servicios" className="acceso-secundario">
            Ya tengo servicios: ver mis servicios
          </Link>
        )}

        <p className="acceso-alternativa">
          <Link to="/login">Volver al ingreso de empresas</Link>
        </p>
      </form>
    </PantallaAcceso>
  );
}