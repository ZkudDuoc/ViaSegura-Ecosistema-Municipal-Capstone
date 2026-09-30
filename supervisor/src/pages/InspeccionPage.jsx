import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { obtenerPermiso, crearInspeccion } from "../services/permisoService";
import { getApiErrorMessage } from "../services/api";
import { RESULTADO_INSPECCION_LABEL } from "../utils/formato";
import "./paginas.css";
import "./supervisor.css";

// Supuesto a validar con el profesor: EPP mínimo exigido en faenas en la vía pública.
const EPP_OBLIGATORIO = "casco, chaleco reflectante y zapatos de seguridad";

const PUNTOS = [
  {
    campo: "senaletica_ok",
    titulo: "Señalética",
    pregunta: "¿Hay conos y vallas instalados correctamente alrededor de la faena?",
  },
  {
    campo: "epp_ok",
    titulo: "EPP obligatorios",
    pregunta: `¿Todo el personal usa ${EPP_OBLIGATORIO}?`,
  },
  {
    campo: "operarios_coinciden",
    titulo: "Operarios",
    pregunta: "¿Las personas en terreno coinciden con las registradas?",
  },
  {
    campo: "patente_coincide",
    titulo: "Patentes",
    pregunta: "¿Los vehículos en terreno coinciden con las patentes registradas?",
  },
];

// El Backend solo cambia el estado a SUSPENDIDO si la obra está en operativo.
const ESTADOS_SUSPENDIBLES = ["ACTIVO", "ACTIVO_PENDIENTE_EVIDENCIA"];

function Referencia({ campo, permiso }) {
  if (campo === "operarios_coinciden") {
    if (!permiso.personal?.length) return <p className="checklist-referencia">Sin personal registrado en la solicitud.</p>;
    return (
      <ul className="checklist-referencia">
        {permiso.personal.map((p) => (
          <li key={p.id}>
            <strong>{p.nombre ?? "Sin nombre"}</strong> · {p.rut}
          </li>
        ))}
      </ul>
    );
  }
  if (campo === "patente_coincide") {
    const patentes = [permiso.vehiculo?.patente, ...(permiso.vehiculos_adicionales ?? []).map((v) => v.patente)].filter(Boolean);
    if (!patentes.length) return <p className="checklist-referencia">Sin vehículos registrados en la solicitud.</p>;
    return <p className="checklist-referencia">Registradas: {patentes.join(" · ")}</p>;
  }
  return null;
}

export default function InspeccionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [permiso, setPermiso] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [respuestas, setRespuestas] = useState(() => ({
    senaletica_ok: null,
    epp_ok: null,
    operarios_coinciden: null,
    // Si el supervisor ya validó la patente en el detalle, viene respondido.
    patente_coincide: location.state?.patenteCoincide ?? null,
  }));
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    obtenerPermiso(id)
      .then(setPermiso)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setCargando(false));
  }, [id]);

  const responder = (campo, valor) => setRespuestas((r) => ({ ...r, [campo]: valor }));

  const todoRespondido = PUNTOS.every((p) => respuestas[p.campo] !== null);
  const todoConforme = PUNTOS.every((p) => respuestas[p.campo] === true);
  const puedeSuspender = permiso && ESTADOS_SUSPENDIBLES.includes(permiso.estado);

  const guardar = async (tipoResultado) => {
    setError(null);
    setGuardando(true);
    try {
      const inspeccion = await crearInspeccion(id, {
        ...respuestas,
        resultado: tipoResultado,
        observaciones: observaciones.trim() || undefined,
      });
      if (tipoResultado === "NO_CONFORME") {
        // Cursar infracción: la inspección queda registrada y se abre el formulario de multa.
        navigate(`/multas/nueva?permiso=${id}`);
        return;
      }
      setResultado(inspeccion);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setGuardando(false);
    }
  };

  const suspender = () => {
    if (!observaciones.trim()) {
      setError("Para suspender la obra escribe el motivo en Observaciones.");
      return;
    }
    if (window.confirm("¿Suspender la obra de inmediato? El trabajo quedará detenido.")) {
      guardar("SUSPENDIDA");
    }
  };

  if (cargando) return <p className="subtitulo">Cargando permiso…</p>;

  if (!permiso) {
    return (
      <div>
        <h1>Inspección</h1>
        <p className="texto-error">{error ?? "No se encontró el permiso"}</p>
        <Link to="/" className="btn-secondary btn-accion">
          Escanear otro permiso
        </Link>
      </div>
    );
  }

  if (resultado) {
    const suspendida = resultado.resultado === "SUSPENDIDA";
    return (
      <div>
        <div className={"veredicto " + (suspendida ? "no-vigente" : "vigente")}>
          <strong>{suspendida ? "OBRA SUSPENDIDA" : "FAENA APROBADA"}</strong>
          <span>{RESULTADO_INSPECCION_LABEL[resultado.resultado]} · inspección registrada</span>
        </div>
        <Link to={`/permisos/${id}`} className="btn-primary btn-accion">
          Volver al permiso
        </Link>
        <Link to="/" className="btn-secondary btn-accion">
          Escanear otro permiso
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1>Inspección en terreno</h1>
      <p className="subtitulo">Permiso {permiso.id.slice(0, 8).toUpperCase()} · responde cada punto.</p>

      <section className="card paso">
        {PUNTOS.map((punto) => (
          <div key={punto.campo} className="checklist-punto">
            <span className="checklist-titulo">{punto.titulo}</span>
            <span className="checklist-pregunta">{punto.pregunta}</span>
            <Referencia campo={punto.campo} permiso={permiso} />
            <div className="si-no" role="group" aria-label={punto.titulo}>
              <button
                type="button"
                className={"si" + (respuestas[punto.campo] === true ? " activo" : "")}
                aria-pressed={respuestas[punto.campo] === true}
                onClick={() => responder(punto.campo, true)}
              >
                Sí
              </button>
              <button
                type="button"
                className={"no" + (respuestas[punto.campo] === false ? " activo" : "")}
                aria-pressed={respuestas[punto.campo] === false}
                onClick={() => responder(punto.campo, false)}
              >
                No
              </button>
            </div>
          </div>
        ))}
      </section>

      <div className="campo">
        <label htmlFor="observaciones">Observaciones</label>
        <textarea
          id="observaciones"
          rows={3}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Lo observado en terreno (obligatorio para suspender)"
        />
      </div>

      {error && <p className="texto-error">{error}</p>}

      <div className="acciones-inspeccion">
        <button
          type="button"
          className="btn-primary btn-aprobar"
          disabled={!todoConforme || guardando}
          onClick={() => guardar("CONFORME")}
        >
          Aprobar faena
        </button>
        {todoRespondido && !todoConforme && (
          <p className="permiso-detalle">Para aprobar, todos los puntos deben estar en "Sí".</p>
        )}

        <button
          type="button"
          className="btn-primary btn-multa"
          disabled={!todoRespondido || guardando}
          onClick={() => guardar("NO_CONFORME")}
        >
          Cursar infracción
        </button>

        <button
          type="button"
          className="btn-primary btn-suspender"
          disabled={!todoRespondido || !puedeSuspender || guardando}
          onClick={suspender}
        >
          Suspender obra
        </button>
        {!puedeSuspender && (
          <p className="permiso-detalle">Solo se puede suspender una obra que está en operativo.</p>
        )}
        {!todoRespondido && <p className="permiso-detalle">Responde los 4 puntos para elegir una acción.</p>}
      </div>

      <Link to={`/permisos/${id}`} className="btn-secondary btn-accion">
        Cancelar
      </Link>
    </div>
  );
}