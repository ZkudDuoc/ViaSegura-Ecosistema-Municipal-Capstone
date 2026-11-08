import Logo from "./Logo";
import "./PantallaAcceso.css";

// Pantalla de acceso: fondo azul marino y, al centro, el logo con una frase
// corta y una tarjeta blanca con el formulario. `descripcion` y `puntos` se
// aceptan por compatibilidad, pero en este diseño no se muestran.
export default function PantallaAcceso({ titulo, children }) {
  return (
    <div className="acceso">
      <div className="acceso-centro">
        <header className="acceso-marca">
          <Logo claro tamano={44} />
          {titulo && <p className="acceso-lema">{titulo}</p>}
        </header>

        <main className="acceso-contenido">{children}</main>

        <footer className="acceso-pie">
          <span className="acceso-barra" aria-hidden="true" />
          Municipalidad de Santiago · Santiago Centro
        </footer>
      </div>
    </div>
  );
}