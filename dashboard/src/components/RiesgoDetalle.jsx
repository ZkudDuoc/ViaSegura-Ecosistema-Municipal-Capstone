import { useState } from "react";
import { reevaluarRiesgo } from "../services/permisoService";
import { getApiErrorMessage } from "../services/api";

const nombreComuna = (comuna) => (comuna?.toUpperCase() === "SANTIAGO" ? "Santiago Centro" : comuna);

// "real (SECTRA, 12 calles cercanas)" -> frase simple; si no hay calles medidas
// cerca, la congestión es una estimación.
function textoFuente(fuente) {
  if (fuente.startsWith("real")) {
    const n = fuente.match(/(\d+) calles/)?.[1];
    return `Congestión medida por SECTRA${n ? ` en ${n} calles cercanas` : ""}.`;
  }
  return "Congestión estimada: no hay calles medidas por SECTRA cerca de esta obra.";
}

// Riesgo de una solicitud explicado para el operador: nivel y puntaje, el
// "por qué" que entrega el servicio de riesgo, la comuna detectada y las
// calles con más carga dentro del área. Si el servicio estaba caído al crear
// la solicitud, permite volver a calcularlo.
export default function RiesgoDetalle({ permiso, onActualizado }) {
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState(null);
  const riesgo = permiso.riesgo;

  const recalcular = async () => {
    setError(null);
    setCalculando(true);
    try {
      await reevaluarRiesgo(permiso.id);
      await onActualizado();
    } catch (err) {
      setError(
        err?.response?.status === 503
          ? "El servicio de riesgo sigue sin responder. Intenta de nuevo en unos minutos."
          : getApiErrorMessage(err)
      );
    } finally {
      setCalculando(false);
    }
  };

  if (!riesgo) {
    return (
      <div className="detalle-riesgo">
        <p className="detalle-vacio">
          Esta solicitud no tiene riesgo calculado (el servicio de riesgo no respondió cuando se creó).
        </p>
        <button type="button" className="btn-riesgo-recalcular" onClick={recalcular} disabled={calculando}>
          {calculando ? "Calculando…" : "Calcular el riesgo ahora"}
        </button>
        {error && <p className="texto-error-chico">{error}</p>}
      </div>
    );
  }

  const calles = riesgo.calles_afectadas ?? [];

  return (
    <div className="detalle-riesgo">
      <p className="detalle-riesgo-nivel">
        <strong>{riesgo.nivel}</strong> · puntaje {Number(riesgo.score).toFixed(2)} de 100
        {riesgo.comuna_detectada && <span className="detalle-riesgo-comuna"> · {nombreComuna(riesgo.comuna_detectada)}</span>}
      </p>

      {riesgo.explicacion ? (
        <p className="detalle-riesgo-explicacion">{riesgo.explicacion}</p>
      ) : (
        <p className="detalle-riesgo-explicacion">El servicio de riesgo no entregó una explicación para esta solicitud.</p>
      )}

      {calles.length > 0 && (
        <>
          <h4 className="detalle-riesgo-subtitulo">Calles del área con más carga</h4>
          <ul className="detalle-riesgo-calles">
            {calles.map((c, i) => (
              <li key={`${c.nombre}-${i}`}>
                <span className="detalle-riesgo-calle">{c.nombre || "Calle sin nombre"}</span>
                <span>Riesgo {Math.round(Number(c.risk_score))}</span>
                <span>Congestión {Math.round(Number(c.congestion_score))}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {riesgo.fuente_congestion && <p className="detalle-riesgo-fuente">{textoFuente(riesgo.fuente_congestion)}</p>}
    </div>
  );
}