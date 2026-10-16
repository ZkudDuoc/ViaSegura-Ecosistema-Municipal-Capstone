import Icono from "./Icono";
import "./EstadoLista.css";

// Mientras carga una lista: bloques grises con la forma de las filas, para que
// la página no salte cuando llegan los datos. `tipo` = "tarjetas" o "tabla".
export function ListaCargando({ filas = 3, tipo = "tarjetas", etiqueta = "Cargando" }) {
  return (
    <div className={`lista-cargando lista-cargando-${tipo}`} aria-busy="true" aria-label={etiqueta}>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="lista-cargando-fila">
          <span className="esqueleto lista-cargando-linea larga" />
          <span className="esqueleto lista-cargando-linea" />
        </div>
      ))}
    </div>
  );
}

// Lista sin resultados: ícono, una frase corta y, si corresponde, qué hacer.
export function ListaVacia({ icono, titulo, children }) {
  return (
    <div className="lista-vacia" role="status">
      <span className="lista-vacia-icono">
        <Icono nombre={icono} tamano={26} />
      </span>
      <p className="lista-vacia-titulo">{titulo}</p>
      {children && <div className="lista-vacia-texto">{children}</div>}
    </div>
  );
}