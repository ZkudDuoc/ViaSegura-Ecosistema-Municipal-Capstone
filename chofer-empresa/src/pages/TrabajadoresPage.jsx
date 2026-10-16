import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listarTrabajadores,
  crearTrabajador,
  actualizarTrabajador,
  darDeBajaTrabajador,
  importarTrabajadores,
} from "../services/trabajadorService";
import { getApiErrorMessage } from "../services/api";
import { formatearRut } from "../utils/rut";
import { iniciales } from "../utils/empresa";
import { estadoVigencia, formatearDia, VIGENCIA_CLASE, VIGENCIA_TEXTO } from "../utils/vigencia";
import { leerNominaCsv, PLANTILLA_CSV } from "../utils/nominaCsv";
import useDebounce from "../hooks/useDebounce";
import BarraBusqueda from "../components/BarraBusqueda";
import TrabajadorForm from "../components/TrabajadorForm";
import { ListaCargando, ListaVacia } from "../components/EstadoLista";
import "./paginas.css";
import "./trabajadores.css";

const POR_PAGINA = 20;

const FILTROS = [
  { valor: "true", label: "Activos" },
  { valor: "false", label: "Dados de baja" },
  { valor: "todos", label: "Todos" },
];

function mensajeError(err) {
  return err?.response?.status === 409 ? "Ya hay un trabajador con ese RUT en tu nómina." : getApiErrorMessage(err);
}

function Vigencia({ titulo, fecha }) {
  const estado = estadoVigencia(fecha);
  return (
    <span className={`badge ${VIGENCIA_CLASE[estado]}`}>
      {titulo}: {VIGENCIA_TEXTO[estado]}
      {fecha ? ` (${formatearDia(fecha)})` : ""}
    </span>
  );
}

function TarjetaTrabajador({ trabajador, puedeEditar, onCambiado }) {
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);

  const guardar = async (datos) => {
    try {
      await actualizarTrabajador(trabajador.id, datos);
    } catch (err) {
      throw new Error(mensajeError(err));
    }
    setEditando(false);
    onCambiado(`Se guardaron los cambios de ${datos.nombre}.`);
  };

  const cambiarActivo = async (activo) => {
    if (!activo && !window.confirm(`¿Dar de baja a ${trabajador.nombre}? Ya no aparecerá al crear solicitudes. Podrás reactivarlo después.`)) {
      return;
    }
    setError(null);
    setOcupado(true);
    try {
      if (activo) await actualizarTrabajador(trabajador.id, { activo: true });
      else await darDeBajaTrabajador(trabajador.id);
      onCambiado(activo ? `${trabajador.nombre} está activo de nuevo.` : `${trabajador.nombre} quedó dado de baja.`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <li className={"card trabajador" + (trabajador.activo ? "" : " inactivo")}>
      {editando ? (
        <>
          <h3 className="paso-titulo">Editar trabajador</h3>
          <TrabajadorForm trabajador={trabajador} prefijo={trabajador.id} onGuardar={guardar} onCancelar={() => setEditando(false)} />
        </>
      ) : (
        <>
          <div className="trabajador-cabecera">
            <span className="trabajador-avatar" aria-hidden="true">
              {iniciales(trabajador.nombre)}
            </span>
            <div className="trabajador-datos">
              <div className="trabajador-nombre">{trabajador.nombre}</div>
              <div className="permiso-detalle">
                {formatearRut(trabajador.rut)}
                {trabajador.cargo ? ` · ${trabajador.cargo}` : ""}
              </div>
            </div>
            {!trabajador.activo && <span className="badge badge-neutro">Dado de baja</span>}
          </div>

          <div className="trabajador-vigencias">
            <Vigencia titulo="Contrato" fecha={trabajador.contrato_vigente_hasta} />
            <Vigencia titulo="EPP" fecha={trabajador.epp_vigente_hasta} />
          </div>

          {puedeEditar && (
            <div className="trabajador-acciones">
              {trabajador.activo ? (
                <>
                  <button type="button" className="btn-secondary" onClick={() => setEditando(true)} disabled={ocupado}>
                    Editar
                  </button>
                  <button type="button" className="btn-secondary btn-peligro" onClick={() => cambiarActivo(false)} disabled={ocupado}>
                    Dar de baja
                  </button>
                </>
              ) : (
                <button type="button" className="btn-secondary" onClick={() => cambiarActivo(true)} disabled={ocupado}>
                  {ocupado ? "Reactivando…" : "Reactivar"}
                </button>
              )}
            </div>
          )}
          {error && <p className="texto-error">{error}</p>}
        </>
      )}
    </li>
  );
}

function descargarPlantilla() {
  // BOM al inicio para que Excel abra bien los tildes.
  const blob = new Blob(["\uFEFF" + PLANTILLA_CSV], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = "plantilla-trabajadores.csv";
  enlace.click();
  URL.revokeObjectURL(url);
}

function PanelImportar({ onImportado, onCerrar }) {
  const [filas, setFilas] = useState(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState(null);
  const [reporte, setReporte] = useState(null);

  const elegirArchivo = async (e) => {
    const archivo = e.target.files?.[0];
    setFilas(null);
    setReporte(null);
    setError(null);
    if (!archivo) return;
    setNombreArchivo(archivo.name);
    try {
      setFilas(leerNominaCsv(await archivo.text()));
    } catch (err) {
      setError(err.message);
    }
  };

  const importar = async () => {
    setError(null);
    setImportando(true);
    try {
      const resultado = await importarTrabajadores(filas);
      setReporte(resultado);
      setFilas(null);
      onImportado();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setImportando(false);
    }
  };

  return (
    <section className="card paso">
      <h2 className="paso-titulo">Importar nómina desde un archivo CSV</h2>
      <p className="permiso-detalle">
        Puedes armarlo en Excel y guardarlo como "CSV". Columnas: rut, nombre, cargo, contrato_vigente_hasta y
        epp_vigente_hasta (fechas como 31-12-2026). Si un RUT ya está en tu nómina, se actualizan sus datos.
      </p>
      <button type="button" className="btn-link" onClick={descargarPlantilla}>
        Descargar plantilla de ejemplo
      </button>

      <div className="campo importar-archivo">
        <label htmlFor="archivo-csv">Archivo</label>
        <input id="archivo-csv" type="file" accept=".csv,text/csv" onChange={elegirArchivo} />
      </div>

      {filas && (
        <div className="importar-confirmar">
          <p>
            <strong>{nombreArchivo}</strong> trae {filas.length} {filas.length === 1 ? "trabajador" : "trabajadores"}.
          </p>
          <button type="button" className="btn-primary" onClick={importar} disabled={importando}>
            {importando ? "Importando…" : `Importar ${filas.length} ${filas.length === 1 ? "trabajador" : "trabajadores"}`}
          </button>
        </div>
      )}

      {error && <p className="texto-error">{error}</p>}

      {reporte && (
        <div className="importar-reporte" aria-live="polite">
          <p className="texto-exito">
            Listo: {reporte.creados} {reporte.creados === 1 ? "nuevo" : "nuevos"} y {reporte.actualizados}{" "}
            {reporte.actualizados === 1 ? "actualizado" : "actualizados"}.
          </p>
          {reporte.errores?.length > 0 && (
            <>
              <p className="texto-error">
                {reporte.errores.length} {reporte.errores.length === 1 ? "fila no se pudo cargar" : "filas no se pudieron cargar"}.
                Corrígelas en el archivo y vuelve a importarlo:
              </p>
              <ul className="importar-errores">
                {reporte.errores.map((e) => (
                  // La fila 1 del archivo son los títulos: la primera fila de datos es la 2.
                  <li key={e.fila}>
                    Fila {e.fila + 1} del archivo: {e.motivo}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <button type="button" className="btn-secondary" onClick={onCerrar}>
        Cerrar
      </button>
    </section>
  );
}

export default function TrabajadoresPage() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.rol === "LOGISTICA";

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("true");
  const [trabajadores, setTrabajadores] = useState([]);
  const [siguiente, setSiguiente] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState(null);
  const [panel, setPanel] = useState(null); // null | "nuevo" | "importar"
  const [mensaje, setMensaje] = useState(null);

  const q = useDebounce(busqueda.trim(), 300);
  // Solo vale la respuesta de la última búsqueda (si se escribe rápido pueden
  // llegar desordenadas).
  const consultaRef = useRef(0);

  const cargar = useCallback(() => {
    const consulta = ++consultaRef.current;
    setCargando(true);
    setError(null);
    listarTrabajadores({ q: q || undefined, activo: filtro, limit: POR_PAGINA })
      .then((res) => {
        if (consulta !== consultaRef.current) return;
        setTrabajadores(res.items);
        setSiguiente(res.next_cursor);
      })
      .catch((err) => consulta === consultaRef.current && setError(getApiErrorMessage(err)))
      .finally(() => consulta === consultaRef.current && setCargando(false));
  }, [q, filtro]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const verMas = async () => {
    setCargandoMas(true);
    try {
      const res = await listarTrabajadores({ q: q || undefined, activo: filtro, limit: POR_PAGINA, cursor: siguiente });
      setTrabajadores((lista) => [...lista, ...res.items]);
      setSiguiente(res.next_cursor);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setCargandoMas(false);
    }
  };

  const alCambiar = (texto) => {
    setMensaje(texto);
    cargar();
  };

  const agregar = async (datos) => {
    try {
      await crearTrabajador(datos);
    } catch (err) {
      throw new Error(mensajeError(err));
    }
    alCambiar(`${datos.nombre} se agregó a la nómina.`);
  };

  const alternarPanel = (nombre) => {
    setMensaje(null);
    setPanel((actual) => (actual === nombre ? null : nombre));
  };

  const sinResultados = !cargando && !error && trabajadores.length === 0;

  return (
    <div>
      <h1>Trabajadores</h1>
      <p className="subtitulo">
        Tu nómina de personal. Al crear una solicitud solo eliges quiénes van a terreno.
      </p>

      {puedeEditar && (
        <div className="trabajadores-botones">
          <button type="button" className={panel === "nuevo" ? "btn-secondary" : "btn-primary"} onClick={() => alternarPanel("nuevo")}>
            {panel === "nuevo" ? "Cerrar formulario" : "Agregar trabajador"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => alternarPanel("importar")}>
            {panel === "importar" ? "Cerrar importación" : "Importar desde Excel (CSV)"}
          </button>
        </div>
      )}

      {panel === "nuevo" && (
        <section className="card paso">
          <h2 className="paso-titulo">Agregar trabajador</h2>
          <TrabajadorForm onGuardar={agregar} />
        </section>
      )}

      {panel === "importar" && <PanelImportar onImportado={cargar} onCerrar={() => setPanel(null)} />}

      {mensaje && (
        <p className="texto-exito" role="status">
          {mensaje}
        </p>
      )}

      <BarraBusqueda
        id="buscar-trabajador"
        valor={busqueda}
        onCambio={setBusqueda}
        placeholder="Nombre o RUT"
        etiqueta="Buscar trabajador"
      />

      <div className="chips trabajadores-filtros" role="group" aria-label="Mostrar">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            type="button"
            className={"chip" + (filtro === f.valor ? " activo" : "")}
            aria-pressed={filtro === f.valor}
            onClick={() => setFiltro(f.valor)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {cargando && <p className="subtitulo">Cargando trabajadores…</p>}

      {error && (
        <div className="card">
          <p className="texto-error">No pudimos cargar la nómina. {error}</p>
          <button type="button" className="btn-secondary" onClick={cargar}>
            Intentar de nuevo
          </button>
        </div>
      )}

      {sinResultados && (
                <ListaVacia
          icono="trabajadores"
          titulo={
            q
              ? `No encontramos trabajadores con "${q}"`
              : filtro === "false"
                ? "No hay trabajadores dados de baja"
                : "Todavía no hay trabajadores en tu nómina"
          }
        >
          {q
            ? "Prueba con otra parte del nombre o con el RUT sin puntos."
            : filtro === "false"
              ? null
              : "Agrégalos uno por uno o impórtalos todos juntos desde un archivo."}
        </ListaVacia>
      )}

      {!cargando && trabajadores.length > 0 && (
        <ul className="lista-permisos">
          {trabajadores.map((t) => (
            <TarjetaTrabajador key={t.id} trabajador={t} puedeEditar={puedeEditar} onCambiado={alCambiar} />
          ))}
        </ul>
      )}

      {!cargando && siguiente && (
        <button type="button" className="btn-secondary trabajadores-ver-mas" onClick={verMas} disabled={cargandoMas}>
          {cargandoMas ? "Cargando…" : "Ver más trabajadores"}
        </button>
      )}
    </div>
  );
}