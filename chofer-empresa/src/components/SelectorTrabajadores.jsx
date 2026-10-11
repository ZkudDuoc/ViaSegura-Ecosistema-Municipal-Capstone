import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listarTrabajadores } from "../services/trabajadorService";
import { getApiErrorMessage } from "../services/api";
import { formatearRut } from "../utils/rut";
import { estadoVigencia, hoyIso } from "../utils/vigencia";
import useDebounce from "../hooks/useDebounce";
import BarraBusqueda from "./BarraBusqueda";
import "./SelectorTrabajadores.css";

const POR_PAGINA = 50;

// Qué le falta a un trabajador para el día del trabajo. Igual que el Backend:
// sin fecha registrada cuenta como no vigente.
function problemas(trabajador, dia) {
  const lista = [];
  if (estadoVigencia(trabajador.contrato_vigente_hasta, dia) === "vencido" || !trabajador.contrato_vigente_hasta) {
    lista.push(trabajador.contrato_vigente_hasta ? "contrato vencido" : "contrato sin fecha");
  }
  if (estadoVigencia(trabajador.epp_vigente_hasta, dia) === "vencido" || !trabajador.epp_vigente_hasta) {
    lista.push(trabajador.epp_vigente_hasta ? "EPP vencido" : "EPP sin fecha");
  }
  return lista;
}

// Elige quiénes van a terreno desde la nómina (solo trabajadores activos).
// `seleccionados` guarda el trabajador completo, así no se pierden al buscar
// otro nombre. `diaTrabajo` ("AAAA-MM-DD") es el día en que termina el
// servicio: contra esa fecha se revisan contrato y EPP.
export default function SelectorTrabajadores({ seleccionados, onChange, diaTrabajo }) {
  const [busqueda, setBusqueda] = useState("");
  const [opciones, setOpciones] = useState([]);
  const [siguiente, setSiguiente] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [hayNomina, setHayNomina] = useState(true);

  const q = useDebounce(busqueda.trim(), 300);
  const consultaRef = useRef(0);
  const dia = diaTrabajo || hoyIso();

  useEffect(() => {
    const consulta = ++consultaRef.current;
    setCargando(true);
    setError(null);
    listarTrabajadores({ q: q || undefined, activo: "true", limit: POR_PAGINA })
      .then((res) => {
        if (consulta !== consultaRef.current) return;
        setOpciones(res.items);
        setSiguiente(res.next_cursor);
        if (!q) setHayNomina(res.items.length > 0);
      })
      .catch((err) => consulta === consultaRef.current && setError(getApiErrorMessage(err)))
      .finally(() => consulta === consultaRef.current && setCargando(false));
  }, [q]);

  const verMas = () =>
    listarTrabajadores({ q: q || undefined, activo: "true", limit: POR_PAGINA, cursor: siguiente })
      .then((res) => {
        setOpciones((lista) => [...lista, ...res.items]);
        setSiguiente(res.next_cursor);
      })
      .catch((err) => setError(getApiErrorMessage(err)));

  const elegido = (id) => seleccionados.some((t) => t.id === id);
  const alternar = (trabajador) =>
    onChange(elegido(trabajador.id) ? seleccionados.filter((t) => t.id !== trabajador.id) : [...seleccionados, trabajador]);

  const advertencias = seleccionados
    .map((t) => ({ trabajador: t, faltas: problemas(t, dia) }))
    .filter((a) => a.faltas.length > 0);

  if (!cargando && !error && !hayNomina) {
    return (
      <div className="card vacio">
        Todavía no tienes trabajadores en tu nómina.{" "}
        <Link to="/trabajadores" className="enlace">
          Agregar trabajadores
        </Link>
      </div>
    );
  }

  return (
    <div className="selector-trabajadores">
      <p className="selector-resumen" aria-live="polite">
        {seleccionados.length === 0
          ? "Aún no eliges a nadie."
          : `${seleccionados.length} ${seleccionados.length === 1 ? "persona elegida" : "personas elegidas"}: ${seleccionados
              .map((t) => t.nombre)
              .join(", ")}.`}
      </p>

      <BarraBusqueda
        id="buscar-personal"
        valor={busqueda}
        onCambio={setBusqueda}
        placeholder="Nombre o RUT"
        etiqueta="Buscar en tu nómina"
      />

      {cargando && <p className="permiso-detalle">Buscando…</p>}
      {error && <p className="texto-error">No pudimos cargar la nómina. {error}</p>}
      {!cargando && !error && opciones.length === 0 && (
        <p className="permiso-detalle">No encontramos trabajadores activos con "{q}".</p>
      )}

      {!cargando && opciones.length > 0 && (
        <ul className="selector-lista">
          {opciones.map((t) => {
            const faltas = problemas(t, dia);
            return (
              <li key={t.id}>
                <label className={"selector-item" + (elegido(t.id) ? " elegido" : "")}>
                  <input type="checkbox" checked={elegido(t.id)} onChange={() => alternar(t)} />
                  <span className="selector-datos">
                    <span className="selector-nombre">{t.nombre}</span>
                    <span className="permiso-detalle">
                      {formatearRut(t.rut)}
                      {t.cargo ? ` · ${t.cargo}` : ""}
                    </span>
                  </span>
                  {faltas.length > 0 && <span className="badge badge-pendiente">{faltas.join(" · ")}</span>}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {!cargando && siguiente && (
        <button type="button" className="btn-link" onClick={verMas}>
          Ver más trabajadores
        </button>
      )}

      {advertencias.length > 0 && (
        <div className="persona-aviso selector-advertencia" role="status">
          <strong>Ojo: puedes enviar la solicitud igual, pero en terreno el supervisor puede cursar una multa.</strong>
          <ul>
            {advertencias.map(({ trabajador, faltas }) => (
              <li key={trabajador.id}>
                {trabajador.nombre}: {faltas.join(" y ")} para la fecha del trabajo.
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}