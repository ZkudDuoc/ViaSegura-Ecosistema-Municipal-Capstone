import "./Logo.css";

// Logo de VíaSegura: pin de ubicación con un check (un permiso aprobado en un
// lugar) y un anillo amarillo de acento. `claro` = para fondos azul marino.
export default function Logo({ tamano = 32, texto = true, claro = false, className = "" }) {
  return (
    <span className={"logo" + (claro ? " logo-claro" : "") + (className ? ` ${className}` : "")}>
      <svg width={tamano} height={tamano} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <path
          d="M20 3c-7.2 0-13 5.6-13 12.6C7 25 20 37 20 37s13-12 13-21.4C33 8.6 27.2 3 20 3z"
          fill={claro ? "#1f6fd1" : "#0b2a5b"}
        />
        <path
          d="m14.5 16.5 4 4 7-7.5"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="16" r="10.5" fill="none" stroke="#f5b700" strokeWidth="1.5" opacity="0.9" />
      </svg>
      {texto && <span className="logo-texto">VíaSegura</span>}
    </span>
  );
}