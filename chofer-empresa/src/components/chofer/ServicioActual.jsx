import { useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import AreaMapa from "../AreaMapa";
import { obtenerQrServicio, finalizarServicio, mensajeError } from "../../services/choferApi";
import { ESTADO_LABEL, ESTADO_CLASE, formatearFecha } from "../../utils/formato";

const AUTORIZACION = {
  PENDIENTE_CONFIRMACION_MUNICIPAL: "Esperando aprobación de la municipalidad",
  EN_COLA_ESPERA: "En cola de espera municipal",
  APROBADO: "Autorizado por la municipalidad",
  ACTIVO: "Autorizado · trabajo en curso",
  ACTIVO_PENDIENTE_EVIDENCIA: "Autorizado · falta evidencia",
};

const ESTADOS_CON_QR = ["APROBADO", "ACTIVO", "ACTIVO_PENDIENTE_EVIDENCIA"];
const ESTADOS_EN_CURSO = ["ACTIVO", "ACTIVO_PENDIENTE_EVIDENCIA"];

function duracion(desde, hasta) {
  const minutos = Math.round((new Date(hasta) - new Date(desde)) / 60000);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return minutos % 60 ? `${horas} h ${minutos % 60} min` : `${horas} h`;
}

export default function ServicioActual({ servicio, token, onActualizado }) {
  const [abierto, setAbierto] = useState(false);
  const [mostrarQr, setMostrarQr] = useState(false);
  const [qr, setQr] = useState(null);
  const [errorQr, setErrorQr] = useState(null);
  const [finalizando, setFinalizando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const codigo = servicio.id.slice(0, 8).toUpperCase();
  const vehiculos = [servicio.vehiculo, ...(servicio.vehiculos_adicionales ?? [])].filter(Boolean);

  const abrirQr = async () => {
    setAbierto(true);
    setMostrarQr(true);
    if (qr) return;
    setErrorQr(null);
    try {
      const { token: tokenQr } = await obtenerQrServicio(servicio.id, token);
      setQr(tokenQr);
    } catch (err) {
      setErrorQr(mensajeError(err));
    }
  };

  const finalizar = async () => {
    if (!window.confirm("¿Finalizar el trabajo? El servicio pasará a tus servicios realizados.")) return;
    setMensaje(null);
    setFinalizando(true);
    try {
      await finalizarServicio(servicio.id, token);
      onActualizado();
    } catch (err) {
      setMensaje(
        err?.response?.status === 403
          ? "Finalizar con código todavía no está habilitado. Avísale a tu empresa. El servicio se cerrará solo al terminar su horario."
          : mensajeError(err)
      );
    } finally {
      setFinalizando(false);
    }
  };

  return (
    <section className="card servicio-actual">
      <button
        type="button"
        className="servicio-resumen"
        onClick={() => {
          setAbierto((a) => !a);
          setMostrarQr(false);
        }}
        aria-expanded={abierto}
      >
        <span className="servicio-resumen-fila">
          <strong>
            {servicio.tipo_actividad === "EMERGENCIA" ? "Emergencia" : "Programado"} · {codigo}
          </strong>
          <span className={`badge ${ESTADO_CLASE[servicio.estado] ?? ""}`}>
            {ESTADO_LABEL[servicio.estado] ?? servicio.estado}
          </span>
        </span>
        <span className="permiso-detalle">
          {formatearFecha(servicio.ventana_inicio)} → {formatearFecha(servicio.ventana_fin)}
        </span>
        <span className="servicio-toque">{abierto ? "Ocultar datos" : "Toca para ver los datos del servicio"}</span>
      </button>

      {abierto &&
        (mostrarQr ? (
          <div className="servicio-qr">
            {qr && <QRCodeSVG value={qr} size={280} level="M" marginSize={2} />}
            {!qr && !errorQr && <p className="subtitulo">Generando QR…</p>}
            {errorQr && <p className="texto-error">{errorQr}</p>}
            <p className="qr-codigo-corto">Servicio {codigo}</p>
            <p className="permiso-detalle">Muéstralo al supervisor municipal.</p>
          </div>
        ) : (
          <div className="servicio-datos">
            <dl className="detalle-datos">
              <div>
                <dt>Autorización</dt>
                <dd>{AUTORIZACION[servicio.estado] ?? ESTADO_LABEL[servicio.estado]}</dd>
              </div>
              <div>
                <dt>Tipo de servicio</dt>
                <dd>{servicio.tipo_actividad === "EMERGENCIA" ? "Emergencia" : "Programado"}</dd>
              </div>
              <div>
                <dt>Tiempo definido</dt>
                <dd>{duracion(servicio.ventana_inicio, servicio.ventana_fin)}</dd>
              </div>
              <div>
                <dt>Termina</dt>
                <dd>{formatearFecha(servicio.ventana_fin)}</dd>
              </div>
            </dl>

            <h3 className="servicio-subtitulo">Lugar</h3>
            <AreaMapa area={servicio.area} height={200} />

            <h3 className="servicio-subtitulo">Personas encargadas</h3>
            {servicio.personal?.length ? (
              <ul className="detalle-lista">
                {servicio.personal.map((p) => (
                  <li key={p.id}>
                    <div>
                      <strong>{p.nombre ?? "Sin nombre"}</strong>
                      <span className="permiso-detalle">
                        {p.cargo ? `${p.cargo} · ` : ""}
                        {p.rut}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="permiso-detalle">Tu empresa no registró personal.</p>
            )}

            <h3 className="servicio-subtitulo">Vehículos</h3>
            {vehiculos.length ? (
              <ul className="detalle-lista">
                {vehiculos.map((v) => (
                  <li key={v.patente}>
                    <span className="patente">{v.patente}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="permiso-detalle">Sin vehículos registrados.</p>
            )}
          </div>
        ))}

      <div className="servicio-acciones">
        {ESTADOS_CON_QR.includes(servicio.estado) && (
          <button type="button" className="btn-secondary" onClick={mostrarQr ? () => setMostrarQr(false) : abrirQr}>
            {mostrarQr ? "Ver datos" : "Mostrar QR"}
          </button>
        )}
        {servicio.estado === "APROBADO" && (
          <Link to={`/chofer/servicios/${servicio.id}/evidencia`} className="btn-primary btn-accion-chofer">
            Iniciar trabajo (foto de evidencia)
          </Link>
        )}
        {ESTADOS_EN_CURSO.includes(servicio.estado) && (
          <button type="button" className="btn-secondary" onClick={finalizar} disabled={finalizando}>
            {finalizando ? "Finalizando…" : "Finalizar trabajo"}
          </button>
        )}
      </div>

      {mensaje && <p className="texto-error">{mensaje}</p>}
    </section>
  );
}