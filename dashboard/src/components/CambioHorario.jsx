import { useState } from "react";
import { solicitarRevision } from "../services/permisoService";
import { getApiErrorMessage } from "../services/api";
import { formatearFecha } from "../utils/permisos";
import "./CambioHorario.css";

const MAX_MOTIVO = 500;

// "2026-10-11T18:30" para un <input type="datetime-local"> (hora local).
function aInputLocal(iso) {
  if (!iso) return "";
  const f = new Date(iso);
  const dos = (n) => String(n).padStart(2, "0");
  return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}T${dos(f.getHours())}:${dos(f.getMinutes())}`;
}

// Igual que el Backend: se puede pedir sobre una solicitud pendiente, o sobre
// una aprobada que todavía no empieza.
function puedePedirCambio(permiso) {
  if (permiso.estado === "PENDIENTE_CONFIRMACION_MUNICIPAL") return true;
  return permiso.estado === "APROBADO" && new Date(permiso.ventana_inicio) > new Date();
}

// Pedir a la empresa que cambie el horario (estado EN_REVISION). Si ya se
// pidió, muestra qué se pidió mientras la empresa corrige.
export default function CambioHorario({ permiso, onActualizado }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [proponer, setProponer] = useState(false);
  const [inicio, setInicio] = useState(() => aInputLocal(permiso.ventana_inicio));
  const [fin, setFin] = useState(() => aInputLocal(permiso.ventana_fin));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  if (permiso.estado === "EN_REVISION") {
    return (
      <section className="detalle-card cambio-horario esperando">
        <h2>Esperando que la empresa corrija el horario</h2>
        <p className="cambio-horario-motivo">
          <strong>Motivo que se le dio:</strong> {permiso.revision_motivo ?? "Sin motivo registrado."}
        </p>
        {permiso.revision_ventana_inicio && (
          <p className="cambio-horario-nota">
            Horario propuesto: {formatearFecha(permiso.revision_ventana_inicio)} hasta{" "}
            {formatearFecha(permiso.revision_ventana_fin)}.
          </p>
        )}
        <p className="cambio-horario-nota">
          Cuando la empresa la corrija, la solicitud vuelve a "Pendiente" y aparecerá en la bandeja para decidir.
        </p>
      </section>
    );
  }

  if (!puedePedirCambio(permiso)) return null;

  const finAntes = proponer && inicio && fin && new Date(fin) <= new Date(inicio);
  const enElPasado = proponer && inicio && new Date(inicio) < new Date();
  const valido = motivo.trim() && (!proponer || (inicio && fin && !finAntes && !enElPasado));

  const enviar = async (e) => {
    e.preventDefault();
    if (!valido) return;
    const aviso = permiso.estado === "APROBADO" ? "\n\nOjo: la solicitud ya estaba aprobada y volverá a quedar pendiente." : "";
    if (!window.confirm(`¿Pedirle a la empresa que cambie el horario?${aviso}`)) return;

    setError(null);
    setEnviando(true);
    try {
      await solicitarRevision(
        permiso.id,
        motivo.trim(),
        proponer ? { inicio: new Date(inicio).toISOString(), fin: new Date(fin).toISOString() } : undefined
      );
      setAbierto(false);
      setMotivo("");
      await onActualizado();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  if (!abierto) {
    return (
      <section className="detalle-card cambio-horario">
        <div className="cambio-horario-fila">
          <div>
            <h2>¿El horario no sirve?</h2>
            <p className="cambio-horario-nota">
              Pídele a la empresa que lo cambie, por ejemplo si choca con una feria, un evento o una hora punta.
            </p>
          </div>
          <button type="button" className="btn-cambio-horario" onClick={() => setAbierto(true)}>
            Pedir cambio de horario
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="detalle-card cambio-horario">
      <h2>Pedir cambio de horario</h2>
      <form onSubmit={enviar}>
        <label htmlFor="motivo-cambio" className="decision-label">
          Motivo (lo verá la empresa)
        </label>
        <textarea
          id="motivo-cambio"
          rows={3}
          maxLength={MAX_MOTIVO}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej: Ese día hay feria en la calle. Por favor cámbialo a la tarde."
        />
        <span className="cambio-horario-contador">
          {motivo.length} de {MAX_MOTIVO} caracteres
        </span>

        <label className="cambio-horario-check">
          <input type="checkbox" checked={proponer} onChange={(e) => setProponer(e.target.checked)} />
          Proponer un horario (opcional)
        </label>

        {proponer && (
          <div className="cambio-horario-fechas">
            <label>
              Desde
              <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </label>
            <label>
              Hasta
              <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} />
            </label>
          </div>
        )}
        {finAntes && <p className="texto-error-chico">El fin debe ser posterior al inicio.</p>}
        {enElPasado && <p className="texto-error-chico">El horario propuesto ya pasó: elige uno futuro.</p>}
        {error && <p className="texto-error-chico">{error}</p>}

        <div className="decision-botones">
          <button type="submit" className="btn-cambio-horario" disabled={!valido || enviando}>
            {enviando ? "Enviando…" : "Enviar a la empresa"}
          </button>
          <button type="button" className="btn-cambio-cancelar" onClick={() => setAbierto(false)} disabled={enviando}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}