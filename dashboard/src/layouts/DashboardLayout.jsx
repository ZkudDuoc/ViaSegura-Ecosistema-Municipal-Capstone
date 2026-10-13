import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ResumenProvider, useResumen } from "../context/ResumenContext";
import { ESTADOS_POR_DECIDIR } from "../utils/resumen";
import api from "../services/api";
import PanicoAlertas from "../components/PanicoAlertas";
import Icono from "../components/Icono";
import "./DashboardLayout.css";

// Menú agrupado: lo del día a día arriba, el control y los reportes abajo.
// `contador` indica qué número mostrar al lado (ver useContadores).
const SECCIONES = [
  {
    titulo: "Operación",
    links: [
      { to: "/", label: "Inicio", icono: "inicio", end: true, contador: "alertas" },
      { to: "/operador", label: "Bandeja de decisiones", icono: "bandeja", contador: "porDecidir" },
    ],
  },
  {
    titulo: "Control",
    links: [
      { to: "/multas", label: "Multas", icono: "multa" },
      { to: "/reporteria", label: "Reportería", icono: "reporte" },
    ],
  },
];

function iniciales(nombre) {
  return (nombre ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

// Nombre de la comuna del operador, para que siempre sepa qué está mirando.
function useNombreComuna(comunaId) {
  const [nombre, setNombre] = useState(null);
  useEffect(() => {
    if (!comunaId) return;
    api
      .get("/comunas")
      .then((res) => setNombre(res.data.find((c) => c.id === comunaId)?.nombre ?? null))
      .catch(() => {});
  }, [comunaId]);
  return nombre;
}

function useContadores() {
  const { permisos, alertas } = useResumen();
  return {
    porDecidir: permisos?.filter((p) => ESTADOS_POR_DECIDIR.includes(p.estado)).length ?? 0,
    alertas: alertas?.length ?? 0,
  };
}

function MenuLateral({ abierto, onCerrar }) {
  const { usuario, logout } = useAuth();
  const comuna = useNombreComuna(usuario?.comuna_id);
  const contadores = useContadores();

  return (
    <aside className={"sidebar" + (abierto ? " abierto" : "")} aria-label="Menú principal">
      <div className="sidebar-cabecera">
        <div>
          <div className="brand">VíaSegura</div>
          <div className="sidebar-comuna">Municipalidad{comuna ? ` · ${comuna}` : ""}</div>
        </div>
        <button type="button" className="sidebar-cerrar" onClick={onCerrar} aria-label="Cerrar menú">
          <Icono nombre="cerrar" />
        </button>
      </div>

      <nav className="sidebar-nav">
        {SECCIONES.map((seccion) => (
          <div key={seccion.titulo} className="sidebar-seccion">
            <div className="sidebar-seccion-titulo">{seccion.titulo}</div>
            {seccion.links.map((link) => {
              const cantidad = link.contador ? contadores[link.contador] : 0;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
                >
                  <Icono nombre={link.icono} />
                  <span className="nav-link-texto">{link.label}</span>
                  {cantidad > 0 && (
                    <span
                      className={"nav-contador" + (link.contador === "alertas" ? " peligro" : "")}
                      aria-label={link.contador === "alertas" ? `${cantidad} alertas abiertas` : `${cantidad} por decidir`}
                    >
                      {cantidad}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-usuario">
        <div className="sidebar-avatar" aria-hidden="true">
          {iniciales(usuario?.nombre)}
        </div>
        <div className="sidebar-usuario-datos">
          <div className="sidebar-usuario-nombre">{usuario?.nombre}</div>
          <div className="sidebar-usuario-rol">Operador central</div>
        </div>
        <button type="button" className="btn-logout" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión">
          <Icono nombre="salir" />
        </button>
      </div>
    </aside>
  );
}

export default function DashboardLayout() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const location = useLocation();

  // En pantallas angostas el menú se cierra solo al cambiar de página.
  useEffect(() => {
    setMenuAbierto(false);
  }, [location.pathname]);

  return (
    <ResumenProvider>
      <div className="layout">
        <header className="barra-movil">
          <button type="button" className="barra-movil-menu" onClick={() => setMenuAbierto(true)} aria-label="Abrir menú">
            <Icono nombre="menu" />
          </button>
          <span className="brand">VíaSegura</span>
        </header>

        <MenuLateral abierto={menuAbierto} onCerrar={() => setMenuAbierto(false)} />
        {menuAbierto && <div className="sidebar-fondo" onClick={() => setMenuAbierto(false)} aria-hidden="true" />}

        <main className="content">
          {/* En el layout, no en una página: una alerta de pánico se ve estés donde estés. */}
          <PanicoAlertas />
          <Outlet />
        </main>
      </div>
    </ResumenProvider>
  );
}