import { useEffect, useMemo, useState } from "react";
import FichaRut from "../components/FichaRut";
import { obtenerResumen, obtenerHistorico, obtenerMapaCalor, obtenerRankingEmpresas } from "../services/reporteriaService";
import { listarInfracciones } from "../services/infraccionService";
import { getApiErrorMessage } from "../services/api";
import { PERIODOS, calcularPeriodo, fechaInput } from "../utils/periodos";
import { ESTADO_LABEL, ESTADO_CLASS, codigoCorto, formatearFecha } from "../utils/permisos";
import "./OperadorPage.css";
import "./SolicitudDetallePage.css";
import "./MultasPage.css";
import "./ReporteriaPage.css";

// "Aprobadas" = todas las que pasaron por la aprobación municipal.
const ESTADOS_APROBADAS = ["APROBADO", "ACTIVO", "ACTIVO_PENDIENTE_EVIDENCIA", "FINALIZADO", "EXPIRADO", "SUSPENDIDO"];
const RIESGO_LABEL = { ALTO: "Alto", MEDIO: "Medio", BAJO: "Bajo" };
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const FILAS_INICIALES = 50;

function sumar(porEstado, estados) {
  return estados.reduce((total, estado) => total + (porEstado?.[estado] ?? 0), 0);
}

function contarEntre(lista, campo, desde, hasta) {
  return lista.filter((x) => {
    const fecha = new Date(x[campo]);
    return fecha >= desde && fecha <= hasta;
  }).length;
}

function formatearMinutos(minutos) {
  if (minutos == null) return null;
  const total = Math.round(Number(minutos));
  if (total < 60) return `${total} ${total === 1 ? "minuto" : "minutos"}`;
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  const textoHoras = `${horas} ${horas === 1 ? "hora" : "horas"}`;
  return resto ? `${textoHoras} y ${resto} ${resto === 1 ? "minuto" : "minutos"}` : textoHoras;
}

function normalizar(texto) {
  return String(texto ?? "").toLowerCase().replace(/[\s.-]/g, "");
}

// Excel en Chile usa ";" como separador y necesita la marca UTF-8 para las tildes.
function descargarExcel(filas, nombreArchivo) {
  const celda = (valor) => `"${String(valor ?? "").replace(/"/g, '""')}"`;
  const encabezados = ["Fecha", "Código", "Empresa", "RUT", "Tipo", "Estado", "Riesgo", "Inicio", "Fin"];
  const lineas = filas.map((f) =>
    [
      formatearFecha(f.created_at),
      codigoCorto(f.id),
      f.nombre_empresa_ejecutora ?? "Persona natural",
      f.rut_ejecutor,
      f.tipo_actividad === "EMERGENCIA" ? "Emergencia" : "Programada",
      ESTADO_LABEL[f.estado] ?? f.estado,
      RIESGO_LABEL[f.riesgo] ?? "Sin evaluar",
      formatearFecha(f.ventana_inicio),
      formatearFecha(f.ventana_fin),
    ]
      .map(celda)
      .join(";")
  );
  const contenido = "\ufeff" + [encabezados.map(celda).join(";"), ...lineas].join("\r\n");
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `${nombreArchivo}.csv`;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Comparacion({ actual, anterior, nombreAnterior, masEsBueno }) {
  const diferencia = actual - anterior;
  if (diferencia === 0) return <span className="cifra-comparacion neutro">Igual que {nombreAnterior}</span>;
  const sube = diferencia > 0;
  const tono = masEsBueno === null ? "neutro" : sube === masEsBueno ? "bueno" : "malo";
  return (
    <span className={`cifra-comparacion ${tono}`}>
      {sube ? "▲" : "▼"} {Math.abs(diferencia)} {sube ? "más" : "menos"} que {nombreAnterior}
    </span>
  );
}

// La base agrupa por hora del servidor (UTC): se pasa a la hora local del navegador.
function mapaCalorLocal(filas) {
  const desfaseHoras = -new Date().getTimezoneOffset() / 60;
  const grilla = Array.from({ length: 7 }, () => Array(24).fill(0));
  filas.forEach(({ dia_semana, hora, total }) => {
    let horaLocal = hora + desfaseHoras;
    let dia = dia_semana; // 0 = domingo
    if (horaLocal < 0) {
      horaLocal += 24;
      dia = (dia + 6) % 7;
    } else if (horaLocal >= 24) {
      horaLocal -= 24;
      dia = (dia + 1) % 7;
    }
    grilla[(dia + 6) % 7][Math.round(horaLocal) % 24] += total; // fila 0 = lunes
  });
  return grilla;
}

function MapaCalor({ filas }) {
  const grilla = mapaCalorLocal(filas);
  const maximo = Math.max(1, ...grilla.flat());
  return (
    <div className="mapa-calor">
      <div className="mapa-calor-fila">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="mapa-calor-hora">
            {h % 3 === 0 ? h : ""}
          </span>
        ))}
      </div>
      {grilla.map((horas, d) => (
        <div key={DIAS[d]} className="mapa-calor-fila">
          <span className="mapa-calor-dia">{DIAS[d]}</span>
          {horas.map((total, h) => (
            <span
              key={h}
              className="mapa-calor-celda"
              style={{ background: total ? `rgba(11, 95, 255, ${0.15 + (0.85 * total) / maximo})` : undefined }}
              title={`${DIAS[d]} ${h}:00 · ${total} solicitudes`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function ReporteriaPage() {
  const [tipo, setTipo] = useState("SEMANA");
  const [rango, setRango] = useState({ desde: fechaInput(-7), hasta: fechaInput(0) });
  const [datos, setDatos] = useState(null);
  const [multas, setMultas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("TODOS");
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [ficha, setFicha] = useState(null);

  const rangoValido = tipo !== "RANGO" || (rango.desde && rango.hasta && rango.desde <= rango.hasta);
  const periodo = useMemo(() => (rangoValido ? calcularPeriodo(tipo, rango) : null), [tipo, rango, rangoValido]);

  useEffect(() => {
    listarInfracciones()
      .then(setMultas)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!periodo) return undefined;
    let cancelado = false;
    setCargando(true);
    setError(null);
    const actual = { desde: periodo.desde.toISOString(), hasta: periodo.hasta.toISOString() };
    const anterior = { desde: periodo.anteriorDesde.toISOString(), hasta: periodo.anteriorHasta.toISOString() };

    Promise.all([
      obtenerResumen(actual),
      obtenerResumen(anterior),
      obtenerHistorico(actual),
      obtenerMapaCalor(actual),
      obtenerRankingEmpresas(actual),
    ])
      .then(([resumen, resumenAnterior, historico, mapaCalor, ranking]) => {
        if (!cancelado) setDatos({ resumen, resumenAnterior, historico, mapaCalor, ranking });
      })
      .catch((err) => {
        if (!cancelado) setError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [periodo]);

  const historialFiltrado = useMemo(() => {
    if (!datos) return [];
    const q = normalizar(busqueda);
    return datos.historico
      .filter((f) => estadoFiltro === "TODOS" || f.estado === estadoFiltro)
      .filter(
        (f) => !q || [f.rut_ejecutor, f.nombre_empresa_ejecutora, codigoCorto(f.id)].some((c) => normalizar(c).includes(q))
      );
  }, [datos, busqueda, estadoFiltro]);

  const r = datos?.resumen;
  const ra = datos?.resumenAnterior;

  const cifras =
    datos && periodo
      ? [
          { titulo: "Solicitudes", actual: r.total_solicitudes.actual, anterior: r.total_solicitudes.anterior, masEsBueno: null },
          {
            titulo: "Aprobadas",
            actual: sumar(r.por_estado, ESTADOS_APROBADAS),
            anterior: sumar(ra.por_estado, ESTADOS_APROBADAS),
            masEsBueno: true,
          },
          {
            titulo: "Rechazadas",
            actual: r.por_estado.RECHAZADO ?? 0,
            anterior: ra.por_estado.RECHAZADO ?? 0,
            masEsBueno: false,
          },
          { titulo: "Alertas de pánico", actual: r.panico.total, anterior: ra.panico.total, masEsBueno: false },
          {
            titulo: "Multas",
            actual: contarEntre(multas, "fecha", periodo.desde, periodo.hasta),
            anterior: contarEntre(multas, "fecha", periodo.anteriorDesde, periodo.anteriorHasta),
            masEsBueno: false,
          },
        ]
      : [];

  const frases = [];
  if (r) {
    const tiempo = formatearMinutos(r.tiempo_promedio_aprobacion_min);
    frases.push(
      tiempo
        ? `En promedio, una solicitud tarda ${tiempo} en aprobarse.`
        : "Todavía no hay solicitudes aprobadas en este período."
    );
    if (r.sla.cumplimiento_pct != null && r.sla.sla_confirmacion_min != null) {
      frases.push(
        `El ${r.sla.cumplimiento_pct}% de las solicitudes se aprobó dentro del plazo de la comuna (${formatearMinutos(r.sla.sla_confirmacion_min)}).`
      );
    }
    if (r.total_solicitudes.actual > 0) {
      frases.push(`Se rechazó el ${r.porcentaje_rechazadas}% y se revocó el ${r.porcentaje_revocadas}% de las solicitudes.`);
    }
    if (r.panico.total === 0) {
      frases.push("No hubo alertas de pánico en este período.");
    } else {
      const respuesta = formatearMinutos(r.panico.tiempo_respuesta_promedio_min);
      frases.push(
        respuesta
          ? `Hubo ${r.panico.total} alertas de pánico. En promedio se atendieron en ${respuesta}.`
          : `Hubo ${r.panico.total} alertas de pánico. Todavía no se registran alertas atendidas.`
      );
    }
  }

  const filasVisibles = mostrarTodas ? historialFiltrado : historialFiltrado.slice(0, FILAS_INICIALES);

  return (
    <div className="reporteria">
      <div className="solo-impresion reporte-encabezado">
        <strong>Municipalidad · Sistema VíaSegura</strong>
        <span>Reporte de gestión de permisos de circulación</span>
        <span>
          {periodo?.titulo} · Emitido el {new Date().toLocaleString("es-CL")}
        </span>
      </div>

      <div className="no-imprimir">
        <h1>Reportería</h1>
        <p className="reporte-texto">Elige el período que quieres revisar.</p>

        <div className="periodo-selector" role="tablist" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="tab"
              aria-selected={tipo === p.value}
              className={"periodo-boton" + (tipo === p.value ? " activo" : "")}
              onClick={() => setTipo(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {tipo === "RANGO" && (
          <div className="periodo-rango">
            <label>
              Desde
              <input type="date" value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} />
            </label>
            <label>
              Hasta
              <input type="date" value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} />
            </label>
            {!rangoValido && <span className="texto-error">La fecha "desde" debe ser anterior a "hasta".</span>}
          </div>
        )}
      </div>

      {periodo && <h2 className="periodo-titulo">{periodo.titulo}</h2>}

      {cargando && <p className="reporte-texto">Cargando reporte…</p>}
      {error && <p className="pending-banner error-banner">{error}</p>}

      {!cargando && datos && periodo && (
        <>
          <div className="cifras-grandes">
            {cifras.map((c) => (
              <div key={c.titulo} className="cifra-grande">
                <span className="cifra-titulo">{c.titulo}</span>
                <span className="cifra-valor">{c.actual}</span>
                <Comparacion
                  actual={c.actual}
                  anterior={c.anterior}
                  nombreAnterior={periodo.nombreAnterior}
                  masEsBueno={c.masEsBueno}
                />
              </div>
            ))}
          </div>

          <section className="reporte-seccion">
            <h2>Lo más importante</h2>
            <ul className="reporte-frases">
              {frases.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </section>

          <section className="reporte-seccion">
            <div className="reporte-seccion-encabezado">
              <h2>Historial de solicitudes</h2>
              <div className="reporte-descargas no-imprimir">
                <button
                  type="button"
                  className="boton-grande"
                  onClick={() => descargarExcel(historialFiltrado, `reporte-${tipo.toLowerCase()}`)}
                  disabled={historialFiltrado.length === 0}
                >
                  Descargar Excel
                </button>
                <button type="button" className="boton-grande" onClick={() => window.print()}>
                  Descargar PDF
                </button>
              </div>
            </div>

            <div className="reporte-filtros no-imprimir">
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por RUT, empresa o código"
                aria-label="Buscar en el historial"
              />
              <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} aria-label="Filtrar por estado">
                <option value="TODOS">Todos los estados</option>
                {Object.entries(ESTADO_LABEL).map(([valor, texto]) => (
                  <option key={valor} value={valor}>
                    {texto}
                  </option>
                ))}
              </select>
            </div>

            <p className="reporte-texto no-imprimir">
              {historialFiltrado.length} solicitudes. Toca una empresa o un RUT para ver su ficha completa.
            </p>

            <table className="solicitudes-table reporte-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Código</th>
                  <th>Empresa</th>
                  <th>RUT</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Riesgo</th>
                </tr>
              </thead>
              <tbody>
                {filasVisibles.length === 0 && (
                  <tr>
                    <td colSpan={7}>No hay solicitudes en este período.</td>
                  </tr>
                )}
                {filasVisibles.map((f) => (
                  <tr key={f.id}>
                    <td>{formatearFecha(f.created_at)}</td>
                    <td className="celda-codigo">{codigoCorto(f.id)}</td>
                    <td>
                      <button
                        type="button"
                        className="multa-link"
                        onClick={() => setFicha({ rut: f.rut_ejecutor, nombre: f.nombre_empresa_ejecutora })}
                      >
                        {f.nombre_empresa_ejecutora ?? "Persona natural"}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="multa-link"
                        onClick={() => setFicha({ rut: f.rut_ejecutor, nombre: f.nombre_empresa_ejecutora })}
                      >
                        {f.rut_ejecutor}
                      </button>
                    </td>
                    <td>{f.tipo_actividad === "EMERGENCIA" ? "Emergencia" : "Programada"}</td>
                    <td>
                      <span className={`estado-pill ${ESTADO_CLASS[f.estado] ?? ""}`}>{ESTADO_LABEL[f.estado] ?? f.estado}</span>
                    </td>
                    <td>{RIESGO_LABEL[f.riesgo] ?? "Sin evaluar"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!mostrarTodas && historialFiltrado.length > FILAS_INICIALES && (
              <button type="button" className="boton-grande no-imprimir mostrar-todas" onClick={() => setMostrarTodas(true)}>
                Mostrar las {historialFiltrado.length} solicitudes
              </button>
            )}
          </section>

          <details className="reporte-seccion reporte-detalles">
            <summary>Más detalles: horarios con más solicitudes y empresas</summary>

            <h3>¿A qué hora llegan más solicitudes?</h3>
            <p className="reporte-texto">Mientras más oscuro el cuadro, más solicitudes a esa hora (hora de Chile).</p>
            <MapaCalor filas={datos.mapaCalor} />

            <h3>Empresas con más solicitudes</h3>
            <table className="solicitudes-table reporte-tabla">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Solicitudes</th>
                  <th>Rechazadas</th>
                  <th>Revocadas</th>
                </tr>
              </thead>
              <tbody>
                {datos.ranking.length === 0 && (
                  <tr>
                    <td colSpan={4}>Sin datos en este período.</td>
                  </tr>
                )}
                {datos.ranking.map((e) => (
                  <tr key={e.empresa}>
                    <td>{e.empresa}</td>
                    <td>{e.total_solicitudes}</td>
                    <td>{e.rechazadas}</td>
                    <td>{e.revocadas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}

      {ficha && <FichaRut rut={ficha.rut} nombre={ficha.nombre} multas={multas} onCerrar={() => setFicha(null)} />}
    </div>
  );
}