import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AreaMapa from "../components/AreaMapa";
import {
  obtenerPermiso,
  aprobarPermiso,
  rechazarPermiso,
  revocarPermiso,
  obtenerDocumento,
} from "../services/permisoService";
import { listarInfracciones } from "../services/infraccionService";
import { getApiErrorMessage } from "../services/api";
import {
  ESTADO_LABEL,
  ESTADO_CLASS,
  RIESGO_CLASS,
  MOTIVO_COLA_LABEL,
  ESTADOS_APROBABLES,
  ESTADOS_RECHAZABLES,
  ESTADOS_REVOCABLES,
  ESTADOS_CON_DOCUMENTO,
  formatearFecha,
  codigoCorto,
} from "../utils/permisos";
import "./OperadorPage.css";
import "./SolicitudDetallePage.css";

const RESULTADO_INSPECCION_LABEL = {
  CONFORME: "faena aprobada",
  NO_CONFORME: "no conforme",
  SUSPENDIDA: "obra suspendida",
};
const CANAL_LABEL = { WEBSOCKET: "el panel en vivo", SMS: "SMS", COLA_LOCAL: "cola local" };
const RESULTADO_CASCADA_LABEL = { ENTREGADO: "Entregado", FALLIDO: "Falló", ENCOLADO: "En espera de un operador" };

// Estos cambios de estado ya tienen su propio evento en la bitácora (con
// actor y motivo): se ocultan los duplicados automáticos del trigger.
const ESTADOS_CON_EVENTO_PROPIO = ["APROBADO", "RECHAZADO", "REVOCADO", "ACTIVO", "FINALIZADO", "SUSPENDIDO"];

function formatearDuracion(desde, hasta) {
  if (!desde || !hasta) return "—";
  const minutos = Math.max(0, Math.round((new Date(hasta) - new Date(desde)) / 60000));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return minutos % 60 ? `${horas} h ${minutos % 60} min` : `${horas} h`;
  return `${Math.floor(horas / 24)} d ${horas % 24} h`;
}

function momentoEvento(eventos, tipo, estado) {
  return (
    eventos.find(
      (e) => e.tipo_evento === tipo || (e.tipo_evento === "CAMBIO_ESTADO_PERMISO" && e.detalle?.estado_nuevo === estado)
    )?.created_at ?? null
  );
}

// Traduce cada evento de la bitácora a un texto legible, con quién lo hizo.
function describirEvento(evento) {
  const d = evento.detalle ?? {};
  switch (evento.tipo_evento) {
    case "CAMBIO_ESTADO_PERMISO":
      if (!d.estado_anterior) return { titulo: "Solicitud creada", quien: "Empresa", tono: "neutro" };
      return {
        titulo: `${ESTADO_LABEL[d.estado_anterior] ?? d.estado_anterior} → ${ESTADO_LABEL[d.estado_nuevo] ?? d.estado_nuevo}`,
        detalle:
          d.estado_nuevo === "EN_COLA_ESPERA" && d.motivo_cola ? MOTIVO_COLA_LABEL[d.motivo_cola] ?? d.motivo_cola : null,
        quien: "Sistema",
        tono: d.estado_nuevo === "EXPIRADO" ? "neutro" : "alerta",
      };
    case "APROBACION_PERMISO":
      return { titulo: "Aprobada", detalle: d.comentario ?? null, quien: "Municipalidad", tono: "ok" };
    case "RECHAZO_PERMISO":
      return { titulo: "Rechazada", detalle: d.motivo ? `Motivo: ${d.motivo}` : null, quien: "Municipalidad", tono: "error" };
    case "REVOCACION_PERMISO":
      return {
        titulo: "Revocada",
        detalle: d.motivo ? `Motivo: ${d.motivo}` : "Sin motivo indicado",
        quien: "Municipalidad",
        tono: "error",
      };
    case "ACTIVACION_PERMISO":
      return { titulo: "Trabajo iniciado en terreno", detalle: "Llegada verificada con GPS y foto", quien: "Chofer", tono: "activo" };
    case "FINALIZACION_PERMISO":
      return { titulo: "Trabajo finalizado", quien: "Chofer", tono: "ok" };
    case "ASIGNACION_MOVIL":
      return { titulo: "Móvil de escolta asignado", detalle: d.identificador_movil, quien: "Municipalidad", tono: "ok" };
    case "VALIDACION_PATENTE":
      return {
        titulo: "Patente fiscalizada",
        detalle: d.coincide
          ? `${d.patente_escaneada}: coincide con el permiso`
          : `${d.patente_escaneada}: no coincide (permiso: ${d.patente_permiso})`,
        quien: "Supervisor",
        tono: d.coincide ? "ok" : "error",
      };
    case "INSPECCION_CHECKLIST":
      return {
        titulo: `Inspección en terreno: ${RESULTADO_INSPECCION_LABEL[d.resultado] ?? d.resultado}`,
        detalle: d.observaciones ?? null,
        quien: "Supervisor",
        tono: d.resultado === "CONFORME" ? "ok" : "error",
      };
    case "INFRACCION_CURSADA":
      return { titulo: "Multa cursada", detalle: d.descripcion, quien: "Supervisor", tono: "error" };
    case "CAMBIO_ESTADO_ALERTA_PANICO":
      return {
        titulo: d.estado_anterior ? `Alerta de pánico: ${String(d.estado_nuevo).toLowerCase()}` : "Alerta de pánico activada",
        quien: d.estado_anterior ? "Sistema" : "Chofer",
        tono: "error",
      };
    case "CASCADA_PANICO":
      return {
        titulo: `Aviso de pánico por ${CANAL_LABEL[d.canal] ?? d.canal}`,
        detalle: RESULTADO_CASCADA_LABEL[d.resultado] ?? d.resultado,
        quien: "Sistema",
        tono: d.resultado === "FALLIDO" ? "error" : "neutro",
      };
    case "PANICO_ATENDIDA":
    case "PANICO_COLA_LOCAL_PROCESADA":
      return { titulo: "Alerta de pánico atendida", quien: "Municipalidad", tono: "ok" };
    default:
      return { titulo: evento.tipo_evento.replaceAll("_", " ").toLowerCase(), quien: "Sistema", tono: "neutro" };
  }
}

function esEventoVisible(evento) {
  if (evento.tipo_evento !== "CAMBIO_ESTADO_PERMISO") return true;
  const { estado_anterior, estado_nuevo } = evento.detalle ?? {};
  return !estado_anterior || !ESTADOS_CON_EVENTO_PROPIO.includes(estado_nuevo);
}

export default function SolicitudDetallePage() {
  const { id } = useParams();
  const [permiso, setPermiso] = useState(null);
  const [multas, setMultas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [nota, setNota] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [errorAccion, setErrorAccion] = useState(null);
  const [descargando, setDescargando] = useState(false);

  const cargar = useCallback(
    () =>
      obtenerPermiso(id)
        .then(setPermiso)
        .catch((err) => {
          if (err?.response?.status === 404 || err?.response?.status === 403) setPermiso(null);
          else setError(getApiErrorMessage(err));
        }),
    [id]
  );

  useEffect(() => {
    cargar().finally(() => setCargando(false));
    listarInfracciones()
      .then((lista) => setMultas(lista.filter((m) => m.permiso_id === id)))
      .catch(() => {});
  }, [cargar, id]);

  const ejecutar = async (accion) => {
    setErrorAccion(null);
    setProcesando(true);
    try {
      await accion();
      setNota("");
      await cargar();
    } catch (err) {
      setErrorAccion(getApiErrorMessage(err));
    } finally {
      setProcesando(false);
    }
  };

  const aprobar = () => ejecutar(() => aprobarPermiso(id, nota.trim() || undefined));
  const rechazar = () => ejecutar(() => rechazarPermiso(id, nota.trim()));
  const revocar = () => {
    if (window.confirm("¿Revocar este permiso? El trabajo dejará de estar autorizado.")) {
      ejecutar(() => revocarPermiso(id, nota.trim() || undefined));
    }
  };

  const descargarDocumento = async () => {
    setErrorAccion(null);
    setDescargando(true);
    try {
      const blob = await obtenerDocumento(id);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `resolucion-${codigoCorto(id)}.pdf`;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setErrorAccion(
        err?.response?.status === 409
          ? "La municipalidad todavía no se pronuncia sobre esta solicitud."
          : "No se pudo descargar la resolución."
      );
    } finally {
      setDescargando(false);
    }
  };

  if (cargando) return <p className="page-subtitle">Cargando solicitud…</p>;

  if (!permiso) {
    return (
      <div>
        <Link to="/operador" className="link-volver">
          ← Volver a la bandeja
        </Link>
        <h1>Solicitud no encontrada</h1>
        <p className="pending-banner error-banner">{error ?? "La solicitud no existe o no pertenece a tu comuna."}</p>
      </div>
    );
  }

  const eventos = permiso.linea_tiempo ?? [];
  const puedeAprobar = ESTADOS_APROBABLES.includes(permiso.estado);
  const puedeRechazar = ESTADOS_RECHAZABLES.includes(permiso.estado);
  const puedeRevocar = ESTADOS_REVOCABLES.includes(permiso.estado);
  const tieneDocumento = ESTADOS_CON_DOCUMENTO.includes(permiso.estado);
  const hayDecision = puedeAprobar || puedeRechazar || puedeRevocar;

  const aprobadoAt = momentoEvento(eventos, "APROBACION_PERMISO", "APROBADO");
  const iniciadoAt = permiso.geofencing_confirmado_at ?? momentoEvento(eventos, "ACTIVACION_PERMISO", "ACTIVO");
  const cierreAt =
    momentoEvento(eventos, "FINALIZACION_PERMISO", "FINALIZADO") ??
    momentoEvento(eventos, "REVOCACION_PERMISO", "REVOCADO") ??
    momentoEvento(eventos, "RECHAZO_PERMISO", "RECHAZADO") ??
    momentoEvento(eventos, null, "SUSPENDIDO") ??
    momentoEvento(eventos, null, "EXPIRADO");
  const enCurso = ["ACTIVO", "ACTIVO_PENDIENTE_EVIDENCIA"].includes(permiso.estado);
  const tieneFoto =
    permiso.foto_evidencia_url?.startsWith("data:image") || permiso.foto_evidencia_url?.startsWith("http");
  const vehiculos = [permiso.vehiculo, ...(permiso.vehiculos_adicionales ?? [])].filter(Boolean);

  return (
    <div className="detalle">
      <Link to="/operador" className="link-volver">
        ← Volver a la bandeja
      </Link>

      <div className="detalle-encabezado">
        <h1>Solicitud {codigoCorto(permiso.id)}</h1>
        <span className={`estado-pill ${ESTADO_CLASS[permiso.estado] ?? ""}`}>
          {ESTADO_LABEL[permiso.estado] ?? permiso.estado}
        </span>
        <span className={`riesgo-pill ${RIESGO_CLASS[permiso.riesgo?.nivel] ?? "riesgo-medio"}`}>
          {permiso.riesgo ? `Riesgo ${permiso.riesgo.nivel.toLowerCase()}` : "Sin evaluar"}
        </span>
        {permiso.tipo_actividad === "EMERGENCIA" && <span className="estado-pill estado-revocado">Emergencia</span>}
      </div>
      <p className="page-subtitle detalle-id">{permiso.id}</p>

      {(hayDecision || tieneDocumento) && (
        <section className="detalle-card decision">
          <h2>Decisión municipal</h2>

          {hayDecision && (
            <>
              <label htmlFor="nota" className="decision-label">
                {puedeAprobar ? "Comentario o motivo" : "Motivo"}
              </label>
              <textarea
                id="nota"
                rows={2}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder={
                  puedeAprobar
                    ? "Opcional al aprobar. Obligatorio para rechazar."
                    : puedeRechazar
                      ? "Obligatorio para rechazar."
                      : "Quedará registrado en el historial."
                }
              />
              <div className="decision-botones">
                {puedeAprobar && (
                  <button type="button" className="btn-aprobar" onClick={aprobar} disabled={procesando}>
                    {procesando ? "Guardando…" : "Aprobar"}
                  </button>
                )}
                {puedeRechazar && (
                  <button type="button" className="btn-danger" onClick={rechazar} disabled={procesando || !nota.trim()}>
                    Rechazar
                  </button>
                )}
                {puedeRevocar && (
                  <button type="button" className="btn-danger" onClick={revocar} disabled={procesando}>
                    Revocar permiso
                  </button>
                )}
              </div>
            </>
          )}

          {tieneDocumento && (
            <button type="button" className="btn-documento" onClick={descargarDocumento} disabled={descargando}>
              {descargando ? "Generando PDF…" : "Descargar resolución (PDF)"}
            </button>
          )}

          {errorAccion && <p className="pending-banner error-banner">{errorAccion}</p>}
        </section>
      )}

      <div className="detalle-grid">
        <section className="detalle-card">
          <h2>Datos de la solicitud</h2>
          <dl className="detalle-datos">
            <div>
              <dt>RUT ejecutor</dt>
              <dd>{permiso.rut_ejecutor}</dd>
            </div>
            <div>
              <dt>Empresa</dt>
              <dd>{permiso.nombre_empresa_ejecutora ?? "Persona natural / no informada"}</dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>{permiso.tipo_actividad === "EMERGENCIA" ? "Emergencia" : "Programada"}</dd>
            </div>
            <div>
              <dt>Altura declarada</dt>
              <dd>{permiso.altura_estimada_m != null ? `${Number(permiso.altura_estimada_m)} m` : "—"}</dd>
            </div>
            <div>
              <dt>Creada</dt>
              <dd>{formatearFecha(permiso.created_at)}</dd>
            </div>
            <div>
              <dt>Desde</dt>
              <dd>{formatearFecha(permiso.ventana_inicio)}</dd>
            </div>
            <div>
              <dt>Hasta</dt>
              <dd>{formatearFecha(permiso.ventana_fin)}</dd>
            </div>
            {permiso.motivo_cola && (
              <div>
                <dt>Motivo de la cola</dt>
                <dd>{MOTIVO_COLA_LABEL[permiso.motivo_cola] ?? permiso.motivo_cola}</dd>
              </div>
            )}
          </dl>

          <h3 className="detalle-subtitulo">Riesgo</h3>
          {permiso.riesgo ? (
            <p className="detalle-riesgo">
              <strong>{permiso.riesgo.nivel}</strong> · puntaje {Number(permiso.riesgo.score).toFixed(2)}
              {permiso.riesgo.explicacion ? (
                <span className="detalle-riesgo-explicacion">{permiso.riesgo.explicacion}</span>
              ) : (
                <span className="detalle-riesgo-explicacion">
                  La explicación del puntaje estará disponible cuando el servicio de riesgo la entregue.
                </span>
              )}
            </p>
          ) : (
            <p className="detalle-vacio">Sin evaluación de riesgo.</p>
          )}
        </section>

        <section className="detalle-card">
          <h2>Área de trabajo</h2>
          <AreaMapa area={permiso.area} />
        </section>
      </div>

      <div className="detalle-grid">
        <section className="detalle-card">
          <h2>Personal a cargo</h2>
          {permiso.personal?.length ? (
            <ul className="detalle-lista">
              {permiso.personal.map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>{p.nombre ?? "Sin nombre"}</strong>
                    <span className="detalle-lista-sub">{p.rut}</span>
                  </div>
                  <div className="detalle-indicadores">
                    <span className={"indicador " + (p.contrato_vigente ? "ok" : "no")}>
                      {p.contrato_vigente ? "Contrato vigente" : "Sin contrato"}
                    </span>
                    <span className={"indicador " + (p.epp_al_dia ? "ok" : "no")}>
                      {p.epp_al_dia ? "EPP al día" : "EPP vencido"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="detalle-vacio">La solicitud no declaró personal.</p>
          )}
        </section>

        <section className="detalle-card">
          <h2>Vehículos y maquinaria</h2>
          {vehiculos.length ? (
            <ul className="detalle-lista">
              {vehiculos.map((v) => (
                <li key={v.patente}>
                  <strong className="detalle-patente">{v.patente}</strong>
                  <span className="detalle-lista-sub">
                    {Number(v.largo_m)} × {Number(v.ancho_m)} m · {Number(v.alto_m)} m alto · {Number(v.peso_ton)} ton
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="detalle-vacio">La solicitud no declaró vehículos.</p>
          )}
        </section>
      </div>

      <section className="detalle-card">
        <h2>Tiempos</h2>
        <div className="detalle-tiempos">
          <div className="tiempo">
            <span className="tiempo-valor">{formatearDuracion(permiso.created_at, aprobadoAt)}</span>
            <span className="tiempo-label">Hasta la aprobación</span>
          </div>
          <div className="tiempo">
            <span className="tiempo-valor">{formatearDuracion(aprobadoAt, iniciadoAt)}</span>
            <span className="tiempo-label">De la aprobación al inicio</span>
          </div>
          <div className="tiempo">
            <span className="tiempo-valor">
              {formatearDuracion(iniciadoAt, cierreAt ?? (enCurso ? new Date().toISOString() : null))}
            </span>
            <span className="tiempo-label">{enCurso ? "En operativo (en curso)" : "Duración en operativo"}</span>
          </div>
        </div>
      </section>

      <div className="detalle-grid">
        <section className="detalle-card">
          <h2>Foto de evidencia</h2>
          {tieneFoto ? (
            <img src={permiso.foto_evidencia_url} alt="Foto de evidencia al iniciar el trabajo" className="detalle-foto" />
          ) : (
            <p className="detalle-vacio">El chofer todavía no inicia el trabajo.</p>
          )}
        </section>

        <section className="detalle-card">
          <h2>Multas de esta solicitud</h2>
          {multas.length ? (
            <ul className="detalle-lista">
              {multas.map((m) => (
                <li key={m.id}>
                  <div>
                    <strong>{m.descripcion}</strong>
                    <span className="detalle-lista-sub">
                      RUT {m.rut_infractor} · {formatearFecha(m.fecha)}
                    </span>
                  </div>
                  {m.evidencia_url && <img src={m.evidencia_url} alt="Evidencia de la multa" className="detalle-multa-foto" />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="detalle-vacio">Sin multas registradas.</p>
          )}
        </section>
      </div>

      <section className="detalle-card">
        <h2>Línea de tiempo</h2>
        {eventos.length === 0 ? (
          <p className="detalle-vacio">Sin eventos registrados.</p>
        ) : (
          <ol className="timeline">
            {eventos.filter(esEventoVisible).map((evento) => {
              const { titulo, detalle, quien, tono } = describirEvento(evento);
              return (
                <li key={evento.id} className={`timeline-item tono-${tono}`}>
                  <span className="timeline-punto" />
                  <div>
                    <div className="timeline-titulo">{titulo}</div>
                    {detalle && <div className="timeline-detalle">{detalle}</div>}
                    <div className="timeline-fecha">
                      {quien} · {formatearFecha(evento.created_at)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}