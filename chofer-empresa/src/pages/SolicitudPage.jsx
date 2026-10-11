import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { crearPermiso } from "../services/permisoService";
import { listarComunas } from "../services/catalogService";
import { listarVehiculos } from "../services/vehiculoService";
import { getApiErrorMessage } from "../services/api";
import { DISTANCIA_CONOS_M } from "../utils/geo";
import { ESTADO_LABEL } from "../utils/formato";
import { validarRut } from "../utils/rut";
import UbicacionPicker from "../components/UbicacionPicker";
import SelectorTrabajadores from "../components/SelectorTrabajadores";
import "./paginas.css";

const TIPOS_ACTIVIDAD = [
  { value: "PROGRAMADA", label: "Programada" },
  { value: "EMERGENCIA", label: "Emergencia" },
];

export default function SolicitudPage() {
  const { usuario } = useAuth();
  const [comunas, setComunas] = useState([]);
  const [vehiculos, setVehiculos] = useState(null);
  const [vehiculoId, setVehiculoId] = useState("");
  const [adicionalesIds, setAdicionalesIds] = useState([]);
  const [comunaId, setComunaId] = useState("");
  const [tipoActividad, setTipoActividad] = useState("PROGRAMADA");
  const [rutEjecutor, setRutEjecutor] = useState(usuario?.empresa?.rut ?? usuario?.rut ?? "");
  const [ventanaInicio, setVentanaInicio] = useState("");
  const [ventanaFin, setVentanaFin] = useState("");
  const [areaCalculada, setAreaCalculada] = useState(null);
  const [trabajadores, setTrabajadores] = useState([]);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    listarComunas()
      .then(setComunas)
      .catch((err) => setError(getApiErrorMessage(err)));
    listarVehiculos()
      .then(setVehiculos)
      .catch((err) => {
        setVehiculos([]);
        setError(getApiErrorMessage(err));
      });
  }, []);

  const vehiculo = vehiculos?.find((v) => v.id === vehiculoId) ?? null;
  const otrosVehiculos = (vehiculos ?? []).filter((v) => v.id !== vehiculoId);

  const ventanaInvalida = ventanaInicio && ventanaFin && new Date(ventanaFin) <= new Date(ventanaInicio);
  const rutEjecutorInvalido = rutEjecutor.trim() !== "" && !validarRut(rutEjecutor);

  // Día en que termina el trabajo ("AAAA-MM-DD"): contra él se revisan contrato y EPP.
  const diaTrabajo = (ventanaFin || ventanaInicio).slice(0, 10) || undefined;

  const formularioValido =
    vehiculo &&
    areaCalculada &&
    comunaId &&
    rutEjecutor.trim() &&
    ventanaInicio &&
    ventanaFin &&
    !ventanaInvalida &&
    trabajadores.length > 0;

  const handleVehiculo = (e) => {
    const nuevoId = e.target.value;
    setVehiculoId(nuevoId);
    // El camión principal no puede estar también como adicional.
    setAdicionalesIds((ids) => ids.filter((id) => id !== nuevoId));
    // Sin camión el mapa se oculta: no dejar un área calculada con medidas de otro camión.
    if (!nuevoId) setAreaCalculada(null);
  };

  const alternarAdicional = (id) =>
    setAdicionalesIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const permiso = await crearPermiso({
        rut_ejecutor: rutEjecutor.trim(),
        comuna_id: comunaId,
        tipo_actividad: tipoActividad,
        area: areaCalculada.area,
        ventana_inicio: new Date(ventanaInicio).toISOString(),
        ventana_fin: new Date(ventanaFin).toISOString(),
        altura_estimada_m: Number(vehiculo.alto_m),
        vehiculo_id: vehiculo.id,
        vehiculos_ids: adicionalesIds,
        // El Backend copia a cada trabajador de la nómina en la solicitud,
        // tal como está hoy (si después lo editan, la solicitud no cambia).
        trabajadores_ids: trabajadores.map((t) => t.id),
      });
      setResultado(permiso);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  // Al crear otra, se mantienen el camión, el personal y la maquinaria (suelen repetirse).
  const nuevaSolicitud = () => {
    setResultado(null);
    setAreaCalculada(null);
    setVentanaInicio("");
    setVentanaFin("");
  };

  if (resultado) {
    return (
      <div className="card">
        <h1>Solicitud enviada</h1>
        <p className="texto-exito">
          Estado: {ESTADO_LABEL[resultado.estado] ?? resultado.estado}
          {resultado.riesgo?.nivel ? ` · Riesgo: ${resultado.riesgo.nivel}` : ""}
        </p>
        {resultado.advertencias?.length > 0 && (
          <div className="persona-aviso">
            <strong>Recuerda regularizar antes del trabajo:</strong>
            <ul>
              {resultado.advertencias.map((a) => (
                <li key={`${a.tipo}-${a.rut}`}>
                  {a.nombre ?? a.rut}: {a.tipo === "CONTRATO_VENCIDO" ? "contrato no vigente" : "EPP no vigente"}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="subtitulo">
          Cuando la municipalidad la apruebe, genera el código del chofer desde el detalle de la solicitud.
        </p>
        <Link to="/solicitudes" className="btn-primary btn-accion">
          Ver mis solicitudes
        </Link>
        <button type="button" className="btn-secondary btn-accion" onClick={nuevaSolicitud}>
          Crear otra solicitud
        </button>
      </div>
    );
  }

  if (vehiculos === null) return <p className="subtitulo">Cargando…</p>;

  if (vehiculos.length === 0) {
    return (
      <div>
        <h1>Nueva solicitud</h1>
        <div className="card vacio">
          Para crear una solicitud primero registra al menos un camión.{" "}
          <Link to="/camiones" className="enlace">
            Registrar camión
          </Link>
        </div>
        {error && <p className="texto-error">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Nueva solicitud</h1>
      <p className="subtitulo">Completa las 5 secciones. El área de trabajo se calcula sola.</p>

      <section className="card paso">
        <h2 className="paso-titulo">1. Camión principal</h2>
        <div className="campo">
          <label htmlFor="vehiculo">Camión</label>
          <select id="vehiculo" value={vehiculoId} onChange={handleVehiculo} required>
            <option value="">Selecciona un camión</option>
            {vehiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.patente} · {Number(v.largo_m)} × {Number(v.ancho_m)} m
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="card paso">
        <h2 className="paso-titulo">2. Ubicación del trabajo</h2>
        {vehiculo ? (
          <UbicacionPicker vehiculo={vehiculo} onChange={setAreaCalculada} />
        ) : (
          <p className="permiso-detalle">Elige primero el camión principal.</p>
        )}
        {vehiculo && areaCalculada && (
          <p className="permiso-detalle">
            Área: {areaCalculada.largoTotalM.toFixed(1)} m × {areaCalculada.anchoTotalM.toFixed(1)} m · incluye{" "}
            {DISTANCIA_CONOS_M} m de conos por lado
          </p>
        )}
      </section>

      <section className="card paso">
        <h2 className="paso-titulo">3. Datos del servicio</h2>

        <div className="campo">
          <label htmlFor="comuna">Comuna</label>
          <select id="comuna" value={comunaId} onChange={(e) => setComunaId(e.target.value)} required>
            <option value="">Selecciona una comuna</option>
            {comunas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label>Tipo de actividad</label>
          <div className="chips">
            {TIPOS_ACTIVIDAD.map((t) => (
              <button
                key={t.value}
                type="button"
                className={"chip" + (tipoActividad === t.value ? " activo" : "")}
                onClick={() => setTipoActividad(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="campo">
          <label htmlFor="rut">RUT de la empresa responsable</label>
          <input
            id="rut"
            value={rutEjecutor}
            onChange={(e) => setRutEjecutor(e.target.value)}
            placeholder="12.345.678-9"
            required
          />
          {rutEjecutorInvalido && (
            <span className="texto-error campo-error">Revisa el RUT: el dígito verificador no coincide.</span>
          )}
        </div>

        <div className="fila-campos">
          <div className="campo">
            <label htmlFor="inicio">Inicio</label>
            <input
              id="inicio"
              type="datetime-local"
              value={ventanaInicio}
              onChange={(e) => setVentanaInicio(e.target.value)}
              required
            />
          </div>
          <div className="campo">
            <label htmlFor="fin">Fin</label>
            <input id="fin" type="datetime-local" value={ventanaFin} onChange={(e) => setVentanaFin(e.target.value)} required />
          </div>
        </div>
        {ventanaInvalida && <p className="texto-error">La fecha de fin debe ser posterior a la de inicio.</p>}
      </section>

      <section className="card paso">
        <h2 className="paso-titulo">4. Personal que va a terreno</h2>
        <p className="permiso-detalle">
          Marca a las personas de tu nómina que irán al trabajo, incluido el chofer.{" "}
          <Link to="/trabajadores" className="enlace">
            Administrar trabajadores
          </Link>
        </p>
        <SelectorTrabajadores seleccionados={trabajadores} onChange={setTrabajadores} diaTrabajo={diaTrabajo} />
      </section>

      <section className="card paso">
        <h2 className="paso-titulo">5. Maquinaria adicional (opcional)</h2>
        {otrosVehiculos.length === 0 ? (
          <p className="permiso-detalle">
            No tienes otros camiones registrados.{" "}
            <Link to="/camiones" className="enlace">
              Registrar maquinaria
            </Link>
          </p>
        ) : (
          <div className="maquinaria-lista">
            {otrosVehiculos.map((v) => (
              <label key={v.id} className="check maquinaria-item">
                <input
                  type="checkbox"
                  checked={adicionalesIds.includes(v.id)}
                  onChange={() => alternarAdicional(v.id)}
                />
                <span className="patente">{v.patente}</span>
                <span className="permiso-detalle">
                  {Number(v.largo_m)} × {Number(v.ancho_m)} m
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      {error && <p className="texto-error">{error}</p>}

      <button type="submit" className="btn-primary" disabled={!formularioValido || enviando}>
        {enviando ? "Enviando…" : "Enviar solicitud"}
      </button>
      {!formularioValido && (
        <p className="permiso-detalle formulario-ayuda">
          Para enviar: camión, ubicación, comuna, RUT, fechas y al menos una persona del personal.
        </p>
      )}
    </form>
  );
}