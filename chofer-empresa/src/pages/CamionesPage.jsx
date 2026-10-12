import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { crearVehiculo, buscarVehiculos, actualizarVehiculo, darDeBajaVehiculo } from "../services/vehiculoService";
import { getApiErrorMessage } from "../services/api";
import useDebounce from "../hooks/useDebounce";
import BarraBusqueda from "../components/BarraBusqueda";
import "./paginas.css";

const POR_PAGINA = 20;

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

function aNumeros(form) {
  return {
    alto_m: Number(form.alto_m),
    ancho_m: Number(form.ancho_m),
    largo_m: Number(form.largo_m),
    peso_ton: Number(form.peso_ton),
  };
}

function CamposMedidas({ form, onCambio, prefijo }) {
  return (
    <div className="fila-campos">
      {CAMPOS_MEDIDAS.map((c) => (
        <div className="campo" key={c.id}>
          <label htmlFor={`${prefijo}-${c.id}`}>{c.label}</label>
          <input
            id={`${prefijo}-${c.id}`}
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0.1"
            value={form[c.id]}
            onChange={onCambio(c.id)}
            placeholder={c.placeholder}
            required
          />
        </div>
      ))}
    </div>
  );
}

function TarjetaCamion({ vehiculo, puedeEditar, onCambiado }) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const empezarEdicion = () => {
    setForm({
      alto_m: String(Number(vehiculo.alto_m)),
      ancho_m: String(Number(vehiculo.ancho_m)),
      largo_m: String(Number(vehiculo.largo_m)),
      peso_ton: String(Number(vehiculo.peso_ton)),
    });
    setError(null);
    setEditando(true);
  };

  const cambio = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const guardar = async (e) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      await actualizarVehiculo(vehiculo.id, aNumeros(form));
      setEditando(false);
      onCambiado(`Se guardaron los cambios del camión ${vehiculo.patente}.`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setGuardando(false);
    }
  };

  const darDeBaja = async () => {
    if (!window.confirm(`¿Dar de baja el camión ${vehiculo.patente}? Ya no podrás usarlo en nuevas solicitudes.`)) return;
    setError(null);
    try {
      await darDeBajaVehiculo(vehiculo.id);
      onCambiado(`El camión ${vehiculo.patente} quedó dado de baja.`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  return (
    <li className="card">
      <div className="permiso-cabecera">
        <span className="patente">{vehiculo.patente}</span>
        {puedeEditar && !editando && (
          <div className="camion-acciones">
            <button type="button" className="btn-link" onClick={empezarEdicion}>
              Editar
            </button>
            <button type="button" className="btn-link btn-link-peligro" onClick={darDeBaja}>
              Dar de baja
            </button>
          </div>
        )}
      </div>

      {editando ? (
        <form onSubmit={guardar}>
          <CamposMedidas form={form} onCambio={cambio} prefijo={vehiculo.id} />
          <div className="camion-edicion-botones">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="permiso-detalle">
          {Number(vehiculo.largo_m)} m largo × {Number(vehiculo.ancho_m)} m ancho × {Number(vehiculo.alto_m)} m alto ·{" "}
          {Number(vehiculo.peso_ton)} ton
        </div>
      )}

      {error && <p className="texto-error">{error}</p>}
    </li>
  );
}

export default function CamionesPage() {
  const { usuario } = useAuth();
  // Editar y dar de baja es solo para el administrador (LOGISTICA), igual que en el Backend.
  const puedeEditar = usuario?.rol === "LOGISTICA";

  const [vehiculos, setVehiculos] = useState([]);
  const [siguiente, setSiguiente] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [errorLista, setErrorLista] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState(null);

  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const q = useDebounce(busqueda.trim(), 300);
  const consultaRef = useRef(0);

  const cargar = useCallback(() => {
    const consulta = ++consultaRef.current;
    setCargando(true);
    setErrorLista(null);
    buscarVehiculos({ q: q || undefined, limit: POR_PAGINA })
      .then((res) => {
        if (consulta !== consultaRef.current) return;
        setVehiculos(res.items);
        setSiguiente(res.nextCursor);
      })
      .catch((err) => consulta === consultaRef.current && setErrorLista(getApiErrorMessage(err)))
      .finally(() => consulta === consultaRef.current && setCargando(false));
  }, [q]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const verMas = async () => {
    setCargandoMas(true);
    try {
      const res = await buscarVehiculos({ q: q || undefined, limit: POR_PAGINA, cursor: siguiente });
      setVehiculos((lista) => [...lista, ...res.items]);
      setSiguiente(res.nextCursor);
    } catch (err) {
      setErrorLista(getApiErrorMessage(err));
    } finally {
      setCargandoMas(false);
    }
  };

  const alCambiar = (texto) => {
    setMensaje(texto);
    cargar();
  };

  const actualizarCampo = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMensaje(null);
    setGuardando(true);
    try {
      const nuevo = await crearVehiculo({ patente: normalizarPatente(form.patente), ...aNumeros(form) });
      setForm(FORM_VACIO);
      alCambiar(`Camión ${nuevo.patente} registrado.`);
    } catch (err) {
      setError(
        err?.response?.status === 409 ? "Ya existe un camión registrado con esa patente" : getApiErrorMessage(err)
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <h1>Camiones</h1>
      <p className="subtitulo">Sus medidas se usan para calcular el área de trabajo de cada solicitud.</p>

      {puedeEditar && (
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

          <CamposMedidas form={form} onCambio={actualizarCampo} prefijo="nuevo" />

          {error && <p className="texto-error">{error}</p>}

          <button type="submit" className="btn-primary" disabled={guardando}>
            {guardando ? "Guardando…" : "Registrar camión"}
          </button>
        </form>
      )}

      <h2 className="paso-titulo">Camiones registrados</h2>

      {mensaje && (
        <p className="texto-exito" role="status">
          {mensaje}
        </p>
      )}

      <BarraBusqueda
        id="buscar-camion"
        valor={busqueda}
        onCambio={setBusqueda}
        placeholder="Patente, por ejemplo ABCD12"
        etiqueta="Buscar camión"
      />

      {cargando && <p className="subtitulo">Cargando camiones…</p>}

      {errorLista && (
        <div className="card">
          <p className="texto-error">No pudimos cargar los camiones. {errorLista}</p>
          <button type="button" className="btn-secondary" onClick={cargar}>
            Intentar de nuevo
          </button>
        </div>
      )}

      {!cargando && !errorLista && vehiculos.length === 0 && (
        <div className="card vacio">
          {q ? `No encontramos camiones con la patente "${q}".` : "Todavía no registras camiones."}
        </div>
      )}

      {!cargando && vehiculos.length > 0 && (
        <ul className="lista-permisos">
          {vehiculos.map((v) => (
            <TarjetaCamion key={v.id} vehiculo={v} puedeEditar={puedeEditar} onCambiado={alCambiar} />
          ))}
        </ul>
      )}

      {!cargando && siguiente && (
        <button type="button" className="btn-secondary btn-accion" onClick={verMas} disabled={cargandoMas}>
          {cargandoMas ? "Cargando…" : "Ver más camiones"}
        </button>
      )}
    </div>
  );
}