import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { listarEmpresas } from "../services/catalogService";
import "./LoginPage.css";

const MODOS = [
  { value: "EMPRESA", label: "Empresa" },
  { value: "NATURAL", label: "Persona natural" },
];

const ROLES_EMPRESA = [
  { value: "CHOFER", label: "Chofer" },
  { value: "LOGISTICA", label: "Logística" },
];

export default function RegistroPage() {
  const { usuario, verificando, registrar, loading, error, limpiarError } = useAuth();
  const navigate = useNavigate();

  const [modo, setModo] = useState("EMPRESA");
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState("");
  const [rol, setRol] = useState("CHOFER");
  const [nombre, setNombre] = useState("");
  const [rut, setRut] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");

  useEffect(() => {
    limpiarError();
    listarEmpresas()
      .then(setEmpresas)
      .catch(() => setEmpresas([]));
  }, [limpiarError]);

  if (verificando) return null;
  if (usuario) return <Navigate to="/" replace />;

  const passwordsDistintas = confirmacion && password !== confirmacion;
  const formularioValido =
    nombre.trim() &&
    rut.trim() &&
    email.trim() &&
    password.length >= 6 &&
    password === confirmacion &&
    (modo === "NATURAL" || empresaId);

  const handleSubmit = (e) => {
    e.preventDefault();
    registrar({
      // Persona natural: chofer independiente, sin empresa asociada.
      rol: modo === "NATURAL" ? "CHOFER" : rol,
      tipo_persona: modo,
      empresa_id: modo === "EMPRESA" ? empresaId : undefined,
      nombre: nombre.trim(),
      rut: rut.trim(),
      email: email.trim(),
      password,
    })
      .then(() => navigate("/", { replace: true }))
      .catch(() => {});
  };

  return (
    <div className="login-screen">
      <form className="login-card registro-card card" onSubmit={handleSubmit}>
        <h1>Crear cuenta</h1>
        <p className="subtitulo">Elige cómo vas a usar VíaSegura</p>

        <div className="modo-selector" role="tablist" aria-label="Tipo de cuenta">
          {MODOS.map((m) => (
            <button
              key={m.value}
              type="button"
              role="tab"
              aria-selected={modo === m.value}
              className={"modo-opcion" + (modo === m.value ? " activo" : "")}
              onClick={() => setModo(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {modo === "EMPRESA" ? (
          <>
            <div className="campo">
              <label htmlFor="empresa">Empresa</label>
              <select id="empresa" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} required>
                <option value="">Selecciona tu empresa</option>
                {empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label>Rol en la empresa</label>
              <div className="chips">
                {ROLES_EMPRESA.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className={"chip" + (rol === r.value ? " activo" : "")}
                    onClick={() => setRol(r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="modo-ayuda">
            Para choferes independientes. Tus camiones y solicitudes quedan a tu nombre.
          </p>
        )}

        <div className="campo">
          <label htmlFor="nombre">Nombre completo</label>
          <input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" required />
        </div>

        <div className="campo">
          <label htmlFor="rut">RUT</label>
          <input id="rut" value={rut} onChange={(e) => setRut(e.target.value)} placeholder="12345678-9" required />
        </div>

        <div className="campo">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>

        <div className="campo">
          <label htmlFor="password">Contraseña (mínimo 6 caracteres)</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>

        <div className="campo">
          <label htmlFor="confirmacion">Repite la contraseña</label>
          <input
            id="confirmacion"
            type="password"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        {passwordsDistintas && <p className="texto-error">Las contraseñas no coinciden.</p>}

        {error && <p className="texto-error">{error}</p>}

        <button type="submit" className="btn-primary" disabled={!formularioValido || loading}>
          {loading ? "Creando cuenta…" : "Crear cuenta"}
        </button>

        <p className="login-alternativa">
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="enlace">
            Inicia sesión
          </Link>
        </p>
      </form>
    </div>
  );
}