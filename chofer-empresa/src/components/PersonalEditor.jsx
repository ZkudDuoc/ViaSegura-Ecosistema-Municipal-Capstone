import { formatearRut, validarRut } from "../utils/rut";

export const CARGOS = ["Chofer", "Trabajador", "Operador de maquinaria", "Supervisor de faena"];

let contador = 0;
export function personaVacia(cargo = "Trabajador") {
  contador += 1;
  return { clave: `persona-${contador}`, nombre: "", rut: "", cargo, contrato_vigente: false, epp_al_dia: false };
}

// Nómina del servicio: quién va a terreno, con RUT, función, contrato y EPP.
// Es lo que el supervisor compara contra las personas reales en la inspección.
export default function PersonalEditor({ personal, onChange }) {
  const actualizar = (clave, campo, valor) =>
    onChange(personal.map((p) => (p.clave === clave ? { ...p, [campo]: valor } : p)));
  const quitar = (clave) => onChange(personal.filter((p) => p.clave !== clave));
  const agregar = () => onChange([...personal, personaVacia()]);

  return (
    <div className="personal-editor">
      {personal.map((p, i) => {
        const rutInvalido = p.rut.trim() !== "" && !validarRut(p.rut);
        const incompleto = !p.contrato_vigente || !p.epp_al_dia;
        return (
          <div key={p.clave} className="card persona">
            <div className="persona-cabecera">
              <strong>Persona {i + 1}</strong>
              {personal.length > 1 && (
                <button type="button" className="btn-link" onClick={() => quitar(p.clave)}>
                  Quitar
                </button>
              )}
            </div>

            <div className="fila-campos">
              <div className="campo">
                <label htmlFor={`${p.clave}-nombre`}>Nombre completo</label>
                <input
                  id={`${p.clave}-nombre`}
                  value={p.nombre}
                  onChange={(e) => actualizar(p.clave, "nombre", e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="campo">
                <label htmlFor={`${p.clave}-rut`}>RUT</label>
                <input
                  id={`${p.clave}-rut`}
                  value={p.rut}
                  onChange={(e) => actualizar(p.clave, "rut", e.target.value)}
                  onBlur={() => validarRut(p.rut) && actualizar(p.clave, "rut", formatearRut(p.rut))}
                  placeholder="12.345.678-9"
                  autoComplete="off"
                />
                {rutInvalido && <span className="texto-error campo-error">RUT no válido</span>}
              </div>
            </div>

            <div className="campo">
              <label htmlFor={`${p.clave}-cargo`}>Función en el servicio</label>
              <select
                id={`${p.clave}-cargo`}
                value={p.cargo}
                onChange={(e) => actualizar(p.clave, "cargo", e.target.value)}
              >
                {CARGOS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="persona-checks">
              <label className="check">
                <input
                  type="checkbox"
                  checked={p.contrato_vigente}
                  onChange={(e) => actualizar(p.clave, "contrato_vigente", e.target.checked)}
                />
                Contrato vigente
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={p.epp_al_dia}
                  onChange={(e) => actualizar(p.clave, "epp_al_dia", e.target.checked)}
                />
                EPP al día
              </label>
            </div>

            {incompleto && (
              <p className="persona-aviso">
                Sin contrato vigente o EPP al día, el supervisor puede cursar una infracción en terreno.
              </p>
            )}
          </div>
        );
      })}

      <button type="button" className="btn-secondary" onClick={agregar}>
        + Agregar persona
      </button>
    </div>
  );
}