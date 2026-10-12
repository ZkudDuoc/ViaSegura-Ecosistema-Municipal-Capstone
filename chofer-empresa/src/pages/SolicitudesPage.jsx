import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listarSolicitudesEmpresa } from "../services/empresaPanelService";
import { getApiErrorMessage } from "../services/api";
import { ESTADO_LABEL, ESTADO_CLASE, formatearFecha } from "../utils/formato";
import useDebounce from "../hooks/useDebounce";
import BarraBusqueda from "../components/BarraBusqueda";
import GraficosEmpresa from "../components/GraficosEmpresa";
import "./paginas.css";
import "./solicitudes.css";

const POR_PAGINA = 25;

// Filtros rápidos = los "grupos" del Backend (GET /api/empresa/solicitudes).
const GRUPOS = [
  { valor: "", label: "Todas" },
  { valor: "pendiente", label: "Esperando aprobación" },
  { valor: "en_revision", label: "Corregir horario" },
  { valor: "aprobada_futura", label: "Aprobadas a futuro" },
  { valor: "en_curso", label: "En curso" },
  { valor: "terminada", label: "Terminadas" },
  { valor: "rechazada", label: "Rechazadas" },
];

const MULTAS = [
  { valor: "", label: "Con y sin multas" },
  { valor: "true", label: "Con multas" },
  { valor: "false", label: "Sin multas" },
];

// Las fechas del filtro son días ("AAAA-MM-DD"); el Backend compara contra el
// inicio del servicio, así que "hasta" incluye el día completo.
const inicioDelDia = (dia) => new Date(`${dia}T00:00:00`).toISOString();
const finDelDia = (dia) => new Date(`${dia}T23:59:59.999`).toISOString();

export default function SolicitudesPage() {
  // Los filtros viven en la URL: el Inicio puede enlazar a un filtro
  // (?grupo=en_revision) y al volver del detalle se mantienen.
  const [params, setParams] = useSearchParams();
  const grupo = params.get("grupo") ?? "";
  const conMultas = params.get("con_multas") ?? "";
  const desde = params.get("desde") ?? "";
  const hasta = params.get("hasta") ?? "";

  const [busqueda, setBusqueda] = useState(params.get("q") ?? "");
  const q = useDebounce(busqueda.trim(), 300);

  const [solicitudes, setSolicitudes] = useState([]);
  const [siguiente, setSiguiente] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState(null);
  const consultaRef = useRef(0);

  const cambiarFiltro = useCallback(
    (nombre, valor) =>
      setParams(
        (actual) => {
          const nuevos = new URLSearchParams(actual);
          if (valor) nuevos.set(nombre, valor);
          else nuevos.delete(nombre);
          return nuevos;
        },
        { replace: true }
      ),
    [setParams]
  );

  useEffect(() => {
    cambiarFiltro("q", q);
  }, [q, cambiarFiltro]);

  const rangoInvalido = desde && hasta && desde > hasta;

  const filtrosApi = useCallback(
    (cursor) => ({
      q: q || undefined,
      grupo: grupo || undefined,
      con_multas: conMultas || undefined,
      desde: desde ? inicioDelDia(desde) : undefined,
      hasta: hasta ? finDelDia(hasta) : undefined,
      limit: POR_PAGINA,
      cursor,
    }),
    [q, grupo, conMultas, desde, hasta]
  );

  const cargar = useCallback(() => {
    if (rangoInvalido) return;
    const consulta = ++consultaRef.current;
    setCargando(true);
    setError(null);
    listarSolicitudesEmpresa(filtrosApi())
      .then((res) => {
        if (consulta !== consultaRef.current) return;
        setSolicitudes(res.items);
        setSiguiente(res.next_cursor);
      })
      .catch((err) => consulta === consultaRef.current && setError(getApiErrorMessage(err)))
      .finally(() => consulta === consultaRef.current && setCargando(false));
  }, [filtrosApi, rangoInvalido]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const verMas = async () => {
    setCargandoMas(true);
    try {
      const res = await listarSolicitudesEmpresa(filtrosApi(siguiente));
      setSolicitudes((lista) => [...lista, ...res.items]);
      setSiguiente(res.next_cursor);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setCargandoMas(false);
    }
  };

  const hayFiltros = Boolean(q || grupo || conMultas || desde || hasta);
  const limpiarFiltros = () => {
    setBusqueda("");
    setParams({}, { replace: true });
  };

  return (
    <div className="solicitudes-pagina">
      <div className="encabezado-fila">
        <h1>Solicitudes</h1>
        <Link to="/solicitud" className="btn-primary solicitudes-nueva">
          Crear solicitud
        </Link>
      </div>
      <p className="subtitulo">Todos los servicios de tu empresa: los de ahora, los que vienen y los pasados.</p>

      <GraficosEmpresa />

      <section className="card paso" aria-labelledby="titulo-filtros">
        <h2 id="titulo-filtros" className="paso-titulo">
          Buscar y filtrar
        </h2>

        <BarraBusqueda
          id="buscar-solicitud"
          valor={busqueda}
          onCambio={setBusqueda}
          placeholder="Patente, RUT o código (ej: 40E89955)"
          etiqueta="Buscar"
        />

        <div className="fila-campos">
          <div className="campo">
            <label htmlFor="desde">Inicio del servicio desde</label>
            <input id="desde" type="date" value={desde} onChange={(e) => cambiarFiltro("desde", e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="hasta">hasta</label>
            <input id="hasta" type="date" value={hasta} onChange={(e) => cambiarFiltro("hasta", e.target.value)} />
          </div>
        </div>
        {rangoInvalido && <p className="texto-error">La fecha "desde" debe ser anterior a la fecha "hasta".</p>}

        <div className="filtro-grupo" role="group" aria-label="Estado">
          {GRUPOS.map((g) => (
            <button
              key={g.valor || "todas"}
              type="button"
              className={"filtro-chip" + (grupo === g.valor ? " activo" : "")}
              aria-pressed={grupo === g.valor}
              onClick={() => cambiarFiltro("grupo", g.valor)}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="filtro-grupo" role="group" aria-label="Multas">
          {MULTAS.map((m) => (
            <button
              key={m.valor || "todas"}
              type="button"
              className={"filtro-chip" + (conMultas === m.valor ? " activo" : "")}
              aria-pressed={conMultas === m.valor}
              onClick={() => cambiarFiltro("con_multas", m.valor)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {hayFiltros && (
          <button type="button" className="btn-link" onClick={limpiarFiltros}>
            Quitar todos los filtros
          </button>
        )}
      </section>

      {cargando && <p className="subtitulo">Cargando solicitudes…</p>}

      {error && (
        <div className="card">
          <p className="texto-error">No pudimos cargar las solicitudes. {error}</p>
          <button type="button" className="btn-secondary" onClick={cargar}>
            Intentar de nuevo
          </button>
        </div>
      )}

      {!cargando && !error && solicitudes.length === 0 && (
        <div className="card vacio">
          {hayFiltros ? (
            <>
              No hay solicitudes con estos filtros.{" "}
              <button type="button" className="btn-link" onClick={limpiarFiltros}>
                Quitar filtros
              </button>
            </>
          ) : (
            <>
              Todavía no tienes solicitudes.{" "}
              <Link to="/solicitud" className="enlace">
                Crear la primera
              </Link>
            </>
          )}
        </div>
      )}

      {!cargando && solicitudes.length > 0 && (
        <div className="tabla-solicitudes" role="table" aria-label="Solicitudes de la empresa">
          <div className="tabla-fila tabla-cabecera" role="row">
            <span role="columnheader">Código</span>
            <span role="columnheader">Patente</span>
            <span role="columnheader">Servicio</span>
            <span role="columnheader">Estado</span>
            <span role="columnheader">Riesgo</span>
            <span role="columnheader">Multas</span>
          </div>
          {solicitudes.map((s) => (
            <Link key={s.id} to={`/solicitudes/${s.id}`} className="tabla-fila" role="row">
              <span role="cell" className="celda-codigo">
                {s.id.slice(0, 8).toUpperCase()}
              </span>
              <span role="cell">{s.patente ? <span className="patente">{s.patente}</span> : "Sin camión"}</span>
              <span role="cell" className="celda-fechas">
                {formatearFecha(s.ventana_inicio)}
                <span className="celda-secundaria">hasta {formatearFecha(s.ventana_fin)}</span>
              </span>
              <span role="cell">
                <span className={`badge ${ESTADO_CLASE[s.estado] ?? ""}`}>{ESTADO_LABEL[s.estado] ?? s.estado}</span>
              </span>
              <span role="cell" className="celda-riesgo">
                {s.riesgo ? `Riesgo ${s.riesgo.toLowerCase()}` : "Sin evaluar"}
              </span>
              <span role="cell">
                {s.tiene_multas ? (
                  <span className="badge badge-error">
                    {s.n_multas} {s.n_multas === 1 ? "multa" : "multas"}
                  </span>
                ) : (
                  <span className="celda-secundaria">Sin multas</span>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}

      {!cargando && siguiente && (
        <button type="button" className="btn-secondary solicitudes-ver-mas" onClick={verMas} disabled={cargandoMas}>
          {cargandoMas ? "Cargando…" : "Ver más solicitudes"}
        </button>
      )}
    </div>
  );
}