import { useEffect, useState } from "react";
import { obtenerEstadisticasEmpresa } from "../services/empresaPanelService";
import { getApiErrorMessage } from "../services/api";
import { ESTADO_LABEL } from "../utils/formato";
import "./GraficosEmpresa.css";

// Colores fijos por estado y por riesgo: el mismo estado siempre del mismo
// color, en todos los gráficos.
const COLOR_ESTADO = {
  PENDIENTE_CONFIRMACION_MUNICIPAL: "#f59e0b",
  EN_COLA_ESPERA: "#eab308",
  EN_REVISION: "#ea580c",
  APROBADO: "#16a34a",
  ACTIVO: "#2563eb",
  ACTIVO_PENDIENTE_EVIDENCIA: "#0891b2",
  FINALIZADO: "#64748b",
  EXPIRADO: "#cbd5e1",
  RECHAZADO: "#dc2626",
  REVOCADO: "#9f1239",
  SUSPENDIDO: "#7c3aed",
};
const COLOR_RIESGO = { Bajo: "#16a34a", Medio: "#f59e0b", Alto: "#dc2626" };
const ORDEN_RIESGO = ["Bajo", "Medio", "Alto"];

function diaIso(fecha) {
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${m}-${d}`;
}

// El Backend solo devuelve los períodos con datos. Para que el gráfico no
// "salte" meses vacíos se completan con 0 todos los períodos del rango.
function periodosDelRango(rango) {
  const desde = new Date(rango.desde);
  const hasta = new Date(rango.hasta);
  const actual =
    rango.agrupar === "mes"
      ? new Date(desde.getFullYear(), desde.getMonth(), 1)
      : new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() - ((desde.getDay() + 6) % 7)); // lunes
  const lista = [];
  while (actual <= hasta && lista.length < 60) {
    lista.push(diaIso(actual));
    if (rango.agrupar === "mes") actual.setMonth(actual.getMonth() + 1);
    else actual.setDate(actual.getDate() + 7);
  }
  return lista;
}

function etiquetaPeriodo(periodo, agrupar) {
  const [y, m, d] = periodo.split("-").map(Number);
  if (agrupar === "mes") {
    const mes = new Date(y, m - 1, 1).toLocaleDateString("es-CL", { month: "short" }).replace(".", "");
    return `${mes} ${String(y).slice(2)}`;
  }
  return `${d}/${m}`;
}

function serie(rango, filas, campo = "total") {
  const porPeriodo = Object.fromEntries(filas.map((f) => [f.periodo, Number(f[campo]) || 0]));
  return periodosDelRango(rango).map((p) => ({
    clave: p,
    etiqueta: etiquetaPeriodo(p, rango.agrupar),
    valor: porPeriodo[p] ?? 0,
  }));
}

function Barras({ titulo, descripcion, datos, color, unidad }) {
  const maximo = Math.max(1, ...datos.map((d) => d.valor));
  const total = datos.reduce((s, d) => s + d.valor, 0);
  // Con muchas barras (semanas) se rotulan solo algunas para que se lean.
  const cadaCuantas = Math.ceil(datos.length / 8);

  return (
    <figure className="grafico">
      <figcaption>
        <span className="grafico-titulo">{titulo}</span>
        <span className="grafico-descripcion">{descripcion}</span>
      </figcaption>
      {total === 0 ? (
        <p className="grafico-vacio">Sin {unidad} en este período.</p>
      ) : (
        <div
          className="barras"
          style={{ gridTemplateColumns: `repeat(${datos.length}, minmax(0, 1fr))` }}
          role="img"
          aria-label={`${titulo}: ` + datos.map((d) => `${d.etiqueta} ${d.valor}`).join(", ")}
        >
          {datos.map((d, i) => (
            <div key={d.clave} className="barra-columna" title={`${d.etiqueta}: ${d.valor} ${unidad}`}>
              <span className="barra-valor">{d.valor > 0 ? d.valor : ""}</span>
              {/* 85% como máximo: deja espacio arriba para el número. */}
              <span className="barra" style={{ height: `${(d.valor / maximo) * 85}%`, background: color }} />
              <span className="barra-etiqueta">{i % cadaCuantas === 0 ? d.etiqueta : ""}</span>
            </div>
          ))}
        </div>
      )}
    </figure>
  );
}

// Gráfico de anillo con su leyenda (color, nombre, cantidad y porcentaje).
function Anillo({ titulo, descripcion, datos }) {
  const total = datos.reduce((s, d) => s + d.valor, 0);
  const radio = 15.915; // circunferencia = 100, así cada segmento se mide en %
  let acumulado = 0;

  return (
    <figure className="grafico">
      <figcaption>
        <span className="grafico-titulo">{titulo}</span>
        <span className="grafico-descripcion">{descripcion}</span>
      </figcaption>
      {total === 0 ? (
        <p className="grafico-vacio">Sin datos en este período.</p>
      ) : (
        <div className="anillo-contenido">
          <svg viewBox="0 0 42 42" className="anillo" role="img" aria-label={`${titulo}: ` + datos.map((d) => `${d.etiqueta} ${d.valor}`).join(", ")}>
            <circle cx="21" cy="21" r={radio} fill="none" stroke="var(--color-bg)" strokeWidth="6" />
            {datos.map((d) => {
              const porcentaje = (d.valor / total) * 100;
              const segmento = (
                <circle
                  key={d.clave}
                  cx="21"
                  cy="21"
                  r={radio}
                  fill="none"
                  stroke={d.color}
                  strokeWidth="6"
                  strokeDasharray={`${porcentaje} ${100 - porcentaje}`}
                  strokeDashoffset={25 - acumulado}
                />
              );
              acumulado += porcentaje;
              return segmento;
            })}
            <text x="21" y="21" textAnchor="middle" dominantBaseline="central" className="anillo-total">
              {total}
            </text>
          </svg>
          <ul className="leyenda">
            {datos.map((d) => (
              <li key={d.clave}>
                <span className="leyenda-color" style={{ background: d.color }} />
                <span className="leyenda-nombre">{d.etiqueta}</span>
                <span className="leyenda-valor">
                  {d.valor} ({Math.round((d.valor / total) * 100)}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}

// Sección de gráficos del historial: GET /api/empresa/estadisticas.
export default function GraficosEmpresa() {
  const [agrupar, setAgrupar] = useState("mes");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    obtenerEstadisticasEmpresa({ agrupar })
      .then((res) => vigente && setDatos(res))
      .catch((err) => vigente && setError(getApiErrorMessage(err)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [agrupar]);

  const porMes = agrupar === "mes";

  return (
    <section className="card paso graficos" aria-labelledby="titulo-graficos">
      <div className="graficos-cabecera">
        <h2 id="titulo-graficos" className="paso-titulo">
          Resumen de los últimos 6 meses
        </h2>
        <div className="graficos-agrupar" role="group" aria-label="Agrupar por">
          {[
            ["mes", "Por mes"],
            ["semana", "Por semana"],
          ].map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              className={"filtro-chip" + (agrupar === valor ? " activo" : "")}
              aria-pressed={agrupar === valor}
              onClick={() => setAgrupar(valor)}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>

      {cargando && <p className="permiso-detalle">Cargando gráficos…</p>}
      {error && <p className="texto-error">No pudimos cargar los gráficos. {error}</p>}

      {!cargando && !error && datos && (
        <>
          {datos.tiempo_promedio_aprobacion_horas != null && (
            <p className="graficos-dato">
              La municipalidad tarda en promedio{" "}
              <strong>
                {datos.tiempo_promedio_aprobacion_horas < 1
                  ? "menos de 1 hora"
                  : `${Math.round(datos.tiempo_promedio_aprobacion_horas)} horas`}
              </strong>{" "}
              en aprobar tus solicitudes.
            </p>
          )}
          <div className="graficos-grilla">
            <Barras
              titulo={porMes ? "Solicitudes por mes" : "Solicitudes por semana"}
              descripcion="Cuántas solicitudes enviaste."
              datos={serie(datos.rango, datos.por_periodo)}
              color="var(--color-primary)"
              unidad="solicitudes"
            />
            <Barras
              titulo={porMes ? "Multas por mes" : "Multas por semana"}
              descripcion="Multas que cursaron los supervisores a tus servicios."
              datos={serie(datos.rango, datos.multas_por_periodo)}
              color="var(--color-danger)"
              unidad="multas"
            />
            <Anillo
              titulo="Solicitudes por estado"
              descripcion="En qué quedó cada solicitud."
              datos={datos.por_estado.map((e) => ({
                clave: e.estado,
                etiqueta: ESTADO_LABEL[e.estado] ?? e.estado,
                valor: e.total,
                color: COLOR_ESTADO[e.estado] ?? "#94a3b8",
              }))}
            />
            <Anillo
              titulo="Solicitudes por nivel de riesgo"
              descripcion="Riesgo que calculó el sistema según el lugar y la hora."
              datos={ORDEN_RIESGO.map((nivel) => ({
                clave: nivel,
                etiqueta: `Riesgo ${nivel.toLowerCase()}`,
                valor: datos.por_riesgo.find((r) => r.nivel === nivel)?.total ?? 0,
                color: COLOR_RIESGO[nivel],
              })).filter((d) => d.valor > 0)}
            />
          </div>
        </>
      )}
    </section>
  );
}