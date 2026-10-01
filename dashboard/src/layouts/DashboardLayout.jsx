import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PanicoAlertas from "../components/PanicoAlertas";
import "./DashboardLayout.css";

// Supervisor dejó de ser un rol/login propio: la reportería es una sección
// más del panel del Operador Central.
const NAV_LINKS = [
  { to: "/operador", label: "Bandeja de decisiones" },
  { to: "/multas", label: "Multas" },
  { to: "/reporteria", label: "Reportería" },
];

export default function DashboardLayout() {
  const { usuario, logout } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">VíaSegura</div>

        <nav>
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-usuario">
          <div className="sidebar-usuario-nombre">{usuario?.nombre}</div>
          <div className="sidebar-usuario-rol">Operador Central</div>
          <button type="button" className="btn-logout" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="content">
        {/* En el layout, no en una página: una alerta de pánico se ve estés donde estés. */}
        <PanicoAlertas />
        <Outlet />
      </main>
    </div>
  );
}