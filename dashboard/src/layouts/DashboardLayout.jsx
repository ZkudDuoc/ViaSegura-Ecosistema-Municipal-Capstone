import { NavLink, Outlet } from "react-router-dom";
import { useRole, ROLES } from "../context/RoleContext";
import "./DashboardLayout.css";

const NAV_BY_ROLE = {
  [ROLES.OPERADOR]: [{ to: "/operador", label: "Bandeja de decisiones" }],
  [ROLES.SUPERVISOR]: [{ to: "/supervisor", label: "Reportería" }],
};

export default function DashboardLayout() {
  const { role, setRole } = useRole();
  const links = NAV_BY_ROLE[role];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">VíaSegura</div>

        <div className="role-switch">
          <label htmlFor="role-select">Rol activo</label>
          <select id="role-select" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value={ROLES.OPERADOR}>Operador Central</option>
            <option value={ROLES.SUPERVISOR}>Supervisor</option>
          </select>
        </div>

        <nav>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
