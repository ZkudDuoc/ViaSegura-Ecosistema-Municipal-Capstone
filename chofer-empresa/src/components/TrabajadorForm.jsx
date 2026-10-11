import { useState } from "react";
import { formatearRut, normalizarRut, validarRut } from "../utils/rut";
import { estadoVigencia, VIGENCIA_CLASE, VIGENCIA_TEXTO } from "../utils/vigencia";

const CARGOS_SUGERIDOS = ["Chofer", "Peoneta", "Operador de maquinaria", "Supervisor de faena", "Trabajador"];

function formDesde(trabajador) {
  return {
    rut: trabajador ? formatearRut(trabajador.rut) : "",
    nombre: trabajador?.nombre ?? "",
    cargo: trabajador?.cargo ?? "",
    contrato_vigente_hasta: trabajador?.contrato_vigente_hasta ?? "",
    epp_vigente_hasta: trabajador?.epp_vigente_hasta ?? "",
  };
}

function AvisoVigencia({ fecha }) {
  if (!fecha) return null;
  const estado = estadoVigencia(fecha);
  if (estado === "vigente") return null;
  return <span className={`badge ${VIGENCIA_CLASE[estado]} trabajador-form-aviso`}>Quedará {VIGENCIA_TEXTO[estado]}</span>;
}

// Formulario de alta y de edición. `trabajador` = null para uno nuevo.
// onGuardar recibe los datos listos para la API y debe lanzar el error si falla.
export default function TrabajadorForm({ trabajador = null, onGuardar, onCancelar, prefijo = "nuevo" }) {
  const [form, setForm] = useState(() => formDesde(trabajador));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const cambio = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const rutInvalido = form.rut.trim() !== "" && !validarRut(form.rut);
  const valido = validarRut(form.rut) && form.nombre.trim() !== "";

  const enviar = async (e) => {
    e.preventDefault();
    if (!valido) return;
    setError(null);
    setGuardando(true);
    try {
      await onGuardar({
        rut: normalizarRut(form.rut),
        nombre: form.nombre.trim(),
        cargo: form.cargo.trim() || null,
        contrato_vigente_hasta: form.contrato_vigente_hasta || null,
        epp_vigente_hasta: form.epp_vigente_hasta || null,
      });
      if (!trabajador) setForm(formDesde(null));
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={enviar} noValidate>
      <div className="fila-campos">
        <div className="campo">
          <label htmlFor={`${prefijo}-rut`}>RUT</label>
          <input
            id={`${prefijo}-rut`}
            value={form.rut}
            onChange={cambio("rut")}
            onBlur={() => validarRut(form.rut) && setForm((f) => ({ ...f, rut: formatearRut(f.rut) }))}
            placeholder="12.345.678-9"
            autoComplete="off"
            aria-invalid={rutInvalido}
            required
          />
          {rutInvalido && <span className="texto-error campo-error">Revisa el RUT: el dígito verificador no coincide.</span>}
        </div>
        <div className="campo">
          <label htmlFor={`${prefijo}-nombre`}>Nombre completo</label>
          <input
            id={`${prefijo}-nombre`}
            value={form.nombre}
            onChange={cambio("nombre")}
            placeholder="Ej: Juan Pérez Soto"
            autoComplete="off"
            required
          />
        </div>
      </div>

      <div className="campo">
        <label htmlFor={`${prefijo}-cargo`}>Cargo (opcional)</label>
        <input
          id={`${prefijo}-cargo`}
          value={form.cargo}
          onChange={cambio("cargo")}
          list={`${prefijo}-cargos`}
          placeholder="Ej: Chofer"
          autoComplete="off"
        />
        <datalist id={`${prefijo}-cargos`}>
          {CARGOS_SUGERIDOS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <div className="fila-campos">
        <div className="campo">
          <label htmlFor={`${prefijo}-contrato`}>Contrato vigente hasta</label>
          <input id={`${prefijo}-contrato`} type="date" value={form.contrato_vigente_hasta} onChange={cambio("contrato_vigente_hasta")} />
          <AvisoVigencia fecha={form.contrato_vigente_hasta} />
        </div>
        <div className="campo">
          <label htmlFor={`${prefijo}-epp`}>Equipo de protección (EPP) vigente hasta</label>
          <input id={`${prefijo}-epp`} type="date" value={form.epp_vigente_hasta} onChange={cambio("epp_vigente_hasta")} />
          <AvisoVigencia fecha={form.epp_vigente_hasta} />
        </div>
      </div>

      {error && <p className="texto-error">{error}</p>}

      <div className="trabajador-form-botones">
        <button type="submit" className="btn-primary" disabled={!valido || guardando}>
          {guardando ? "Guardando…" : trabajador ? "Guardar cambios" : "Agregar trabajador"}
        </button>
        {onCancelar && (
          <button type="button" className="btn-secondary" onClick={onCancelar}>
            Cancelar
          </button>
        )}
      </div>
      {!valido && <p className="permiso-detalle formulario-ayuda">Para guardar: RUT válido y nombre.</p>}
    </form>
  );
}