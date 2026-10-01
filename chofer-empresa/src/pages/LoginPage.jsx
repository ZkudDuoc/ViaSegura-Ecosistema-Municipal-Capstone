import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./LoginPage.css";

function IconoOjo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconoOjoTachado() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2" />
      <path d="M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M2 2l20 20" />
    </svg>
  );
}

export default function LoginPage() {
  const { usuario, verificando, login, loading, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);

  const destino = location.state?.from?.pathname ?? "/";

  if (verificando) return null;
  if (usuario) return <Navigate to={destino} replace />;

  const handleSubmit = (e) => {
    e.preventDefault();
    login(email, password)
      .then(() => navigate(destino, { replace: true }))
      .catch(() => { });
  };

  return (
    <div className="login-screen">
      <form className="login-card card" onSubmit={handleSubmit}>
        <h1>VíaSegura</h1>
        {/* chofer-empresa: "Choferes y empresas de transporte" · supervisor: "Supervisión municipal en terreno" */}
        <p className="subtitulo">Choferes y empresas de transporte</p>

        <div className="campo">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div className="campo">
          <label htmlFor="password">Contraseña</label>
          <div className="password-wrapper">
            <input
              id="password"
              type={mostrarPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setMostrarPassword((v) => !v)}
              aria-label={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              aria-pressed={mostrarPassword}
            >
              {mostrarPassword ? <IconoOjoTachado /> : <IconoOjo />}
            </button>
          </div>
        </div>

        {error && <p className="texto-error">{error}</p>}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Ingresando…" : "Iniciar sesión"}
        </button>
        <p className="login-alternativa">
          ¿No tienes cuenta?{" "}
          <Link to="/registro" className="enlace">
            Crear cuenta
          </Link>
        </p>
        <Link to="/chofer" className="btn-secondary btn-accion login-chofer">
          ¿Eres chofer? Ingresa con tu código
        </Link>
      </form>
    </div>
  );
}