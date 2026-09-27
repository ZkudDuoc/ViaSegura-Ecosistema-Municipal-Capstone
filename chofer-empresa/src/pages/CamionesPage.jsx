import { useEffect, useState } from "react";
import { crearVehiculo, listarVehiculos } from "../services/vehiculoService";
import { getApiErrorMessage } from "../services/api";
import "./paginas.css";

const CAMPOS_MEDIDAS = [
  { id: "alto_m", label: "Alto (m)", placeholder: "Ej: 4.2" },
  { id: "ancho_m", label: "Ancho (m)", placeholder: "Ej: 2.6" },
  { id: "largo_m", label: "Largo (m)", placeholder: "Ej: 12" },
  { id: "peso_ton", label: "Peso (ton)", placeholder: "Ej: 18" },
];

const FORM_VACIO = { patente: "", alto_m: "", ancho_m: "", largo_m: "", peso_ton: "" };

// Patente sin espacios ni guiones y en mayúsculas (ej. "ABCD12"), igual a
// como la compara el Backend al validarla en terreno.
function normalizarPatente(patente) {
  return patente.replace(/[\s-]/g, "").toUpperCase();
}

export default function CamionesPage() {
  const [vehiculos, setVehiculos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);

  const cargar = () =>
    listarVehiculos()
      .then(setVehiculos)
      .catch((err) => setError(getApiErrorMessage(err)));

  useEffect(() => {
    cargar().finally(() => setLoading(false));
  }, []);

  const actualizarCampo = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setExito(null);
    setGuardando(true);
    try {
      const nuevo = await crearVehiculo({
        patente: normalizarPatente(form.patente),
        alto_m: Number(form.alto_m),
        ancho_m: Number(form.ancho_m),
        largo_m: Number(form.largo_m),
        peso_ton: Number(form.peso_ton),
      });
      setExito(`Camión ${nuevo.patente} registrado`);
      setForm(FORM_VACIO);
      await cargar();
    } catch (err) {
      setError(
        err?.response?.status === 409
          ? "Ya existe un camión registrado con esa patente"
          : getApiErrorMessage(err)
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <h1>Mis camiones</h1>
      <p className="subtitulo">Sus medidas se usan para calcular el área de trabajo de cada solicitud.</p>

      <form className="card paso" onSubmit={handleSubmit}>
        <h2 className="paso-titulo">Registrar camión</h2>

        <div className="campo">
          <label htmlFor="patente">Patente</label>
          <input
            id="patente"
            value={form.patente}
            onChange={actualizarCampo("patente")}
            placeholder="Ej: ABCD12"
            autoCapitalize="characters"
            required
          />
        </div>

        <div className="fila-campos">
          {CAMPOS_MEDIDAS.map((c) => (
            <div className="campo" key={c.id}>
              <label htmlFor={c.id}>{c.label}</label>
              <input
                id={c.id}
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0.1"
                value={form[c.id]}
                onChange={actualizarCampo(c.id)}
                placeholder={c.placeholder}
                required
              />
            </div>
          ))}
        </div>

        {error && <p className="texto-error">{error}</p>}
        {exito && <p className="texto-exito">{exito}</p>}

        <button type="submit" className="btn-primary" disabled={guardando}>
          {guardando ? "Guardando…" : "Registrar camión"}
        </button>
      </form>

      <h2 className="paso-titulo">Camiones registrados</h2>
      {loading && <p className="subtitulo">Cargando…</p>}
      {!loading && vehiculos.length === 0 && <div className="card vacio">Todavía no registras camiones.</div>}

      <ul className="lista-permisos">
        {vehiculos.map((v) => (
          <li key={v.id} className="card">
            <div className="permiso-cabecera">
              <span className="patente">{v.patente}</span>
            </div>
            <div className="permiso-detalle">
              {Number(v.largo_m)} m largo × {Number(v.ancho_m)} m ancho × {Number(v.alto_m)} m alto ·{" "}
              {Number(v.peso_ton)} ton
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}