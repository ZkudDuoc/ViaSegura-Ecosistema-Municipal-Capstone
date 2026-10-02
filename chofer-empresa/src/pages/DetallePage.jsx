import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AreaMapa from "../components/AreaMapa";
import { obtenerPermiso, obtenerDocumento, generarCodigoChofer } from "../services/permisoService";
import { getApiErrorMessage } from "../services/api";
import { ESTADO_LABEL, ESTADO_CLASE, formatearFecha } from "../utils/formato";
import "./paginas.css";
import "./detalle.css";

// La resolución en PDF existe solo cuando la municipalidad ya se pronunció.
const ESTADOS_CON_DOCUMENTO = [
  "APROBADO",
  "ACTIVO",
  "ACTIVO_PENDIENTE_EVIDENCIA",
  "FINALIZADO",
  "EXPIRADO",
  "REVOCADO",
  "SUSPENDIDO",
  "RECHAZADO",
];
// El código del chofer tiene sentido mientras el servicio no esté cerrado.
const ESTADOS_CON_CODIGO = [
  "PENDIENTE_CONFIRMACION_MUNICIPAL",
  "EN_COLA_ESPERA",
  "APROBADO",
  "ACTIVO",
  "ACTIVO_PENDIENTE_EVIDENCIA",
];
const ESTADOS_CERRADOS_CON_MOTIVO = ["RECHAZADO", "REVOCADO", "SUSPENDIDO"];

const RESULTADO_INSPECCION = {
  CONFORME: "faena aprobada",
  NO_CONFORME: "no conforme",
  SUSPENDIDA: "obra suspendida",
};

// Línea de tiempo en lenguaje simple para la empresa. Se omiten los eventos
// internos (avisos por SMS/cola, cambios automáticos duplicados).
function describirEvento(evento) {
  const d = evento.detalle ?? {};
  switch (evento.tipo_evento) {
    case "CAMBIO_ESTADO_PERMISO":
      if (!d.estado_anterior) return { titulo: "Solicitud enviada", tono: "neutro" };
      if (d.estado_nuevo === "EN_COLA_ESPERA") return { titulo: "En cola de espera", tono: "alerta" };
      if (d.estado_nuevo === "EXPIRADO") return { titulo: "Servicio expirado", tono: "neutro" };
      return null;
    case "APROBACION_PERMISO":
      return { titulo: "Aprobada por la municipalidad", detalle: d.comentario ?? null, tono: "ok" };
    case "RECHAZO_PERMISO":
      return { titulo: "Rechazada por la municipalidad", detalle: d.motivo ? `Motivo: ${d.motivo}` : null, tono: "error" };
    case "REVOCACION_PERMISO":
      return { titulo: "Revocada por la municipalidad", detalle: d.motivo ? `Motivo: ${d.motivo}` : null, tono: "error" };
    case "ACTIVACION_PERMISO":
      return { titulo: "Trabajo iniciado en terreno", tono: "activo" };
    case "FINALIZACION_PERMISO":
      return { titulo: "Trabajo finalizado", tono: "ok" };
    case "ASIGNACION_MOVIL":
      return { titulo: "Móvil de escolta asignado", tono: "ok" };
    case "VALIDACION_PATENTE":
      return {
        titulo: "Patente revisada por un supervisor",
        detalle: d.coincide ? "Coincide con el permiso" : "No coincide con el permiso",
        tono: d.coincide ? "ok" : "error",
      };
    case "INSPECCION_CHECKLIST":
      return {
        titulo: `Inspección en terreno: ${RESULTADO_INSPECCION[d.resultado] ?? d.resultado}`,
        detalle: d.observaciones ?? null,
        tono: d.resultado === "CONFORME" ? "ok" : "error",
      };
    case "INFRACCION_CURSADA":
      return { titulo: "Multa cursada", detalle: d.descripcion, tono: "error" };
    case "CAMBIO_ESTADO_ALERTA_PANICO":
      return d.estado_anterior ? null : { titulo: "Alerta de pánico enviada", tono: "error" };
    case "PANICO_ATENDIDA":
      return { titulo: "Alerta de pánico atendida por la municipalidad", tono: "ok" };
    default:
      return null;
  }
}

// Motivo del cierre, para mostrarlo destacado arriba.
function motivoDeCierre(permiso) {
  const eventos = [...(permiso.linea_tiempo ?? [])].reverse();
  if (permiso.estado === "RECHAZADO") return eventos.find((e) => e.tipo_evento === "RECHAZO_PERMISO")?.detalle?.motivo;
  if (permiso.estado === "REVOCADO") return eventos.find((e) => e.tipo_evento === "REVOCACION_PERMISO")?.detalle?.motivo;
  if (permiso.estado === "SUSPENDIDO") {
    return eventos.find((e) => e.tipo_evento === "INSPECCION_CHECKLIST" && e.detalle?.resultado === "SUSPENDIDA")
      ?.detalle?.observaciones;
  }
  return null;
}

function CodigoChofer({ permisoId }) {
  const [codigo, setCodigo] = useState(null);
  const [generando, setGenerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState(null);

  const generar = async () => {
    setError(null);
    setCopiado(false);
    setGenerando(true);
    try {
      setCodigo(await generarCodigoChofer(permisoId));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setGenerando(false);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo.codigo);
      setCopiado(true);
    } catch {
      setError("No se pudo copiar. Selecciona el código y cópialo a mano.");
    }
  };

  const mensajeWhatsapp = codigo
    ? `Tu código de acceso a VíaSegura para el servicio es: ${codigo.codigo}\n` +
      `Entra a la web, toca "¿Eres chofer?" e ingrésalo. Sirve una sola vez y vence el ${formatearFecha(codigo.expira_at)}.`
    : "";

  return (
    <section className="card paso">
      <h2 className="paso-titulo">Código para el chofer</h2>
      <p className="permiso-detalle">
        El chofer lo ingresa en "¿Eres chofer?" para ver este servicio, enviar evidencia y usar el botón de pánico,
        sin necesidad de tener cuenta.
      </p>

      {codigo ? (
        <div className="codigo-chofer">
          <code className="codigo-valor">{codigo.codigo}</code>
          <p className="permiso-detalle">
            Sirve una sola vez · vence el {formatearFecha(codigo.expira_at)}
          </p>
          <div className="codigo-acciones">
            <button type="button" className="btn-secondary" onClick={copiar}>
              {copiado ? "Copiado" : "Copiar código"}
            </button>
            <a
              className="btn-secondary"
              href={`https://wa.me/?text=${encodeURIComponent(mensajeWhatsapp)}`}
              target="_blank"
              rel="noreferrer"
            >
              Enviar por WhatsApp
            </a>
          </div>
          <button type="button" className="btn-link" onClick={generar} disabled={generando}>
            Generar otro código
          </button>
        </div>
      ) : (
        <button type="button" className="btn-primary" onClick={generar} disabled={generando}>
          {generando ? "Generando…" : "Generar código"}
        </button>
      )}

      {error && <p className="texto-error">{error}</p>}
    </section>
  );
}

export default function DetallePage() {
  const { id } = useParams();
  const [permiso, setPermiso] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [descargando, setDescargando] = useState(false);
  const [errorPdf, setErrorPdf] = useState(null);

  useEffect(() => {
    obtenerPermiso(id)
      .then(setPermiso)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setCargando(false));
  }, [id]);

  const descargarDocumento = async () => {
    setErrorPdf(null);
    setDescargando(true);
    try {
      const blob = await obtenerDocumento(id);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `resolucion-${id.slice(0, 8).toUpperCase()}.pdf`;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setErrorPdf("No se pudo descargar la resolución. Intenta de nuevo.");
    } finally {
      setDescargando(false);
    }
  };

  if (cargando) return <p className="subtitulo">Cargando solicitud…</p>;

  if (!permiso) {
    return (
      <div>
        <Link to="/" className="enlace">
          ← Mis solicitudes
        </Link>
        <h1>Solicitud no encontrada</h1>
        <p className="texto-error">{error ?? "La solicitud no existe."}</p>
      </div>
    );
  }

  const motivo = ESTADOS_CERRADOS_CON_MOTIVO.includes(permiso.estado) ? motivoDeCierre(permiso) : null;
  const eventos = (permiso.linea_tiempo ?? [])
    .map((e) => ({ ...e, texto: describirEvento(e) }))
    .filter((e) => e.texto);
  const vehiculos = [permiso.vehiculo, ...(permiso.vehiculos_adicionales ?? [])].filter(Boolean);

  return (
    <div>
      <Link to="/" className="enlace">
        ← Mis solicitudes
      </Link>

      <div className="encabezado-fila detalle-encabezado">
        <h1>Solicitud {permiso.id.slice(0, 8).toUpperCase()}</h1>
        <span className={`badge ${ESTADO_CLASE[permiso.estado] ?? ""}`}>
          {ESTADO_LABEL[permiso.estado] ?? permiso.estado}
        </span>
      </div>

      {ESTADOS_CERRADOS_CON_MOTIVO.includes(permiso.estado) && (
        <div className="motivo-cierre">
          <strong>
            {permiso.estado === "RECHAZADO"
              ? "La municipalidad rechazó esta solicitud"
              : permiso.estado === "REVOCADO"
                ? "La municipalidad revocó este permiso"
                : "Un supervisor suspendió la obra"}
          </strong>
          <span>{motivo ? `Motivo: ${motivo}` : "No se indicó motivo."}</span>
        </div>
      )}

      {ESTADOS_CON_DOCUMENTO.includes(permiso.estado) && (
        <>
          <button type="button" className="btn-secondary btn-accion" onClick={descargarDocumento} disabled={descargando}>
            {descargando ? "Generando PDF…" : "Descargar resolución (PDF)"}
          </button>
          {errorPdf && <p className="texto-error">{errorPdf}</p>}
        </>
      )}

      {ESTADOS_CON_CODIGO.includes(permiso.estado) && <CodigoChofer permisoId={permiso.id} />}

      <section className="card paso">
        <h2 className="paso-titulo">Datos del servicio</h2>
        <dl className="detalle-datos">
          <div>
            <dt>Tipo</dt>
            <dd>{permiso.tipo_actividad === "EMERGENCIA" ? "Emergencia" : "Programada"}</dd>
          </div>
          <div>
            <dt>Riesgo</dt>
            <dd>{permiso.riesgo ? `${permiso.riesgo.nivel} (puntaje ${Number(permiso.riesgo.score).toFixed(2)})` : "Sin evaluar"}</dd>
          </div>
          <div>
            <dt>Desde</dt>
            <dd>{formatearFecha(permiso.ventana_inicio)}</dd>
          </div>
          <div>
            <dt>Hasta</dt>
            <dd>{formatearFecha(permiso.ventana_fin)}</dd>
          </div>
          <div>
            <dt>RUT ejecutor</dt>
            <dd>{permiso.rut_ejecutor}</dd>
          </div>
          <div>
            <dt>Enviada</dt>
            <dd>{formatearFecha(permiso.created_at)}</dd>
          </div>
        </dl>
      </section>

      <section className="card paso">
        <h2 className="paso-titulo">Área de trabajo</h2>
        <AreaMapa area={permiso.area} height={240} />
      </section>

      <section className="card paso">
        <h2 className="paso-titulo">Personal a cargo</h2>
        {permiso.personal?.length ? (
          <ul className="detalle-lista">
            {permiso.personal.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{p.nombre ?? "Sin nombre"}</strong>
                  <span className="permiso-detalle">{p.rut}</span>
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
          <p className="permiso-detalle">No se declaró personal.</p>
        )}
      </section>

      <section className="card paso">
        <h2 className="paso-titulo">Vehículos y maquinaria</h2>
        {vehiculos.length ? (
          <ul className="detalle-lista">
            {vehiculos.map((v) => (
              <li key={v.patente}>
                <span className="patente">{v.patente}</span>
                <span className="permiso-detalle">
                  {Number(v.largo_m)} × {Number(v.ancho_m)} m · {Number(v.alto_m)} m alto
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="permiso-detalle">No se declararon vehículos.</p>
        )}
      </section>

      <section className="card paso">
        <h2 className="paso-titulo">Historial</h2>
        {eventos.length === 0 ? (
          <p className="permiso-detalle">Sin movimientos todavía.</p>
        ) : (
          <ol className="timeline">
            {eventos.map((e) => (
              <li key={e.id} className={`timeline-item tono-${e.texto.tono}`}>
                <span className="timeline-punto" />
                <div>
                  <div className="timeline-titulo">{e.texto.titulo}</div>
                  {e.texto.detalle && <div className="timeline-detalle">{e.texto.detalle}</div>}
                  <div className="timeline-fecha">{formatearFecha(e.created_at)}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}