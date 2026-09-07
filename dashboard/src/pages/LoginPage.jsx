import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./LoginPage.css";

export default function LoginPage() {
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    login(email, password).catch(() => {});
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>VíaSegura</h1>
        <p className="page-subtitle">Inicia sesión para acceder al panel</p>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />

        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        {error && <p className="login-error">{error}</p>}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Ingresando…" : "Iniciar sesión"}
        </button>
      </form>
    </div>
  );
}
