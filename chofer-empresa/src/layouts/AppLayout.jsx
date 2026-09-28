import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./AppLayout.css";

const NAV_LINKS = [
  { to: "/", label: "Mis solicitudes", end: true },
  { to: "/solicitud", label: "Nueva solicitud" },
  { to: "/camiones", label: "Camiones" },
  { to: "/panico", label: "Pánico" },
];

export default function AppLayout() {
  const { usuario, logout } = useAuth();
  const esPersonaNatural = usuario?.tipo_persona === "NATURAL";

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">VíaSegura</div>

        <nav className="app-nav">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => "app-nav-link" + (isActive ? " active" : "")}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="app-usuario">
          <span className={"app-modo" + (esPersonaNatural ? " natural" : "")}>
            {esPersonaNatural ? "Persona natural" : "Empresa"}
          </span>
          <span className="app-usuario-nombre">{usuario?.nombre}</span>
          <button type="button" className="app-logout" onClick={logout}>
            Salir
          </button>
        </div>
      </header>

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}