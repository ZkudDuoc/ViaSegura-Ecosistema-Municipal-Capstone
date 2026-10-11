import "./BarraBusqueda.css";

// Campo de búsqueda con botón para limpiar. La página decide qué hacer con el
// texto (normalmente pasarlo por useDebounce y enviarlo como `q`).
export default function BarraBusqueda({ id, valor, onCambio, placeholder, etiqueta = "Buscar" }) {
  return (
    <div className="barra-busqueda" role="search">
      <label htmlFor={id} className="barra-busqueda-etiqueta">
        {etiqueta}
      </label>
      <div className="barra-busqueda-campo">
        <svg className="barra-busqueda-lupa" width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          id={id}
          type="search"
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
        {valor && (
          <button type="button" className="barra-busqueda-limpiar" onClick={() => onCambio("")}>
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}