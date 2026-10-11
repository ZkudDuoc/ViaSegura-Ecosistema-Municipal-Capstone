import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Icono from "../components/Icono";
import { nombreEmpresa } from "../utils/empresa";
import "./AppLayout.css";

// Mismo menú en todas las páginas: barra lateral en escritorio y barra fija
// abajo en el celular. Así cualquier sección queda a un toque de distancia.
const NAV_LINKS = [
  { to: "/", label: "Inicio", icono: "inicio", end: true },
  { to: "/solicitudes", label: "Solicitudes", icono: "solicitudes" },
  { to: "/solicitud", label: "Crear solicitud", corto: "Crear", icono: "crear" },
  { to: "/camiones", label: "Camiones", icono: "camion" },
  { to: "/trabajadores", label: "Trabajadores", icono: "trabajadores" },
];

export default function AppLayout() {
  const { usuario, logout } = useAuth();
  const empresa = nombreEmpresa(usuario);

  return (
    <div className="app">
      <aside className="app-lateral">
        <div className="app-brand">VíaSegura</div>
        {empresa && <div className="app-empresa">{empresa}</div>}

        <nav className="app-nav" aria-label="Menú principal">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => "app-nav-link" + (isActive ? " active" : "")}
            >
              <Icono nombre={link.icono} className="app-nav-icono" />
              <span className="app-nav-texto-largo">{link.label}</span>
              <span className="app-nav-texto-corto">{link.corto ?? link.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="app-usuario">
          <span className="app-usuario-nombre">{usuario?.nombre}</span>
          <button type="button" className="app-logout" onClick={logout}>
            <Icono nombre="salir" tamano={18} />
            Salir
          </button>
        </div>
      </aside>

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}