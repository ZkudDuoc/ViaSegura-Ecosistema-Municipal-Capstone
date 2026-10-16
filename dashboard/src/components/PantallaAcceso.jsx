import Logo from "./Logo";
import "./PantallaAcceso.css";

// Pantalla de acceso dividida: a la izquierda la marca (azul marino) con qué
// hace la app; a la derecha el formulario. En el celular la marca queda como
// una franja arriba.
export default function PantallaAcceso({ titulo, descripcion, puntos = [], children }) {
  return (
    <div className="acceso">
      <aside className="acceso-marca">
        <Logo claro tamano={40} />

        <div className="acceso-mensaje">
          <h2 className="acceso-titulo">{titulo}</h2>
          {descripcion && <p className="acceso-descripcion">{descripcion}</p>}
          {puntos.length > 0 && (
            <ul className="acceso-puntos">
              {puntos.map((punto) => (
                <li key={punto}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <circle cx="12" cy="12" r="10" fill="rgba(245, 183, 0, 0.18)" />
                    <path d="m7.5 12.5 3 3 6-6.5" fill="none" stroke="#f5b700" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {punto}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="acceso-pie">
          <span className="acceso-barra" aria-hidden="true" />
          Santiago Centro
        </div>
      </aside>

      <main className="acceso-panel">
        <div className="acceso-contenido">{children}</div>
      </main>
    </div>
  );
}