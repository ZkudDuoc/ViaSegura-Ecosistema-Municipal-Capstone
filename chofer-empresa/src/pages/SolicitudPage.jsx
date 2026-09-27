import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { crearPermiso } from "../services/permisoService";
import { listarComunas } from "../services/catalogService";
import { listarVehiculos } from "../services/vehiculoService";
import { getApiErrorMessage } from "../services/api";
import { DISTANCIA_CONOS_M } from "../utils/geo";
import { ESTADO_LABEL } from "../utils/formato";
import UbicacionPicker from "../components/UbicacionPicker";
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
  const [comunaId, setComunaId] = useState("");
  const [tipoActividad, setTipoActividad] = useState("PROGRAMADA");
  const [rutEjecutor, setRutEjecutor] = useState(usuario?.rut ?? "");
  const [ventanaInicio, setVentanaInicio] = useState("");
  const [ventanaFin, setVentanaFin] = useState("");
  const [areaCalculada, setAreaCalculada] = useState(null);

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

  const ventanaInvalida = ventanaInicio && ventanaFin && new Date(ventanaFin) <= new Date(ventanaInicio);
  const formularioValido =
    vehiculo && comunaId && rutEjecutor && ventanaInicio && ventanaFin && !ventanaInvalida && areaCalculada;

  const handleVehiculo = (e) => {
    setVehiculoId(e.target.value);
    // Sin camión el mapa se oculta: no dejar un área calculada con medidas de otro camión.
    if (!e.target.value) setAreaCalculada(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const permiso = await crearPermiso({
        rut_ejecutor: rutEjecutor,
        comuna_id: comunaId,
        tipo_actividad: tipoActividad,
        area: areaCalculada.area,
        ventana_inicio: new Date(ventanaInicio).toISOString(),
        ventana_fin: new Date(ventanaFin).toISOString(),
        altura_estimada_m: Number(vehiculo.alto_m),
        vehiculo_id: vehiculo.id,
      });
      setResultado(permiso);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

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
        <p className="subtitulo">
          Cuando la municipalidad la apruebe, podrás iniciar el trabajo desde "Mis solicitudes".
        </p>
        <Link to="/" className="btn-primary btn-accion">
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
      <p className="subtitulo">Elige el camión e indica dónde estará: el área se calcula automáticamente.</p>

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

      <div className="campo">
        <label>Ubicación del camión</label>
        {vehiculo ? (
          <UbicacionPicker vehiculo={vehiculo} onChange={setAreaCalculada} />
        ) : (
          <div className="card vacio">Elige un camión para marcar su ubicación.</div>
        )}
        {vehiculo && areaCalculada && (
          <span className="permiso-detalle">
            Área: {areaCalculada.largoTotalM.toFixed(1)} m × {areaCalculada.anchoTotalM.toFixed(1)} m · incluye{" "}
            {DISTANCIA_CONOS_M} m de conos por lado
            {areaCalculada.posicion.precision != null &&
              ` · precisión GPS ±${Math.round(areaCalculada.posicion.precision)} m`}
          </span>
        )}
      </div>

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
        <label htmlFor="rut">RUT del ejecutor</label>
        <input id="rut" value={rutEjecutor} onChange={(e) => setRutEjecutor(e.target.value)} placeholder="12345678-9" required />
      </div>

      <div className="fila-campos">
        <div className="campo">
          <label htmlFor="inicio">Inicio</label>
          <input id="inicio" type="datetime-local" value={ventanaInicio} onChange={(e) => setVentanaInicio(e.target.value)} required />
        </div>
        <div className="campo">
          <label htmlFor="fin">Fin</label>
          <input id="fin" type="datetime-local" value={ventanaFin} onChange={(e) => setVentanaFin(e.target.value)} required />
        </div>
      </div>
      {ventanaInvalida && <p className="texto-error">La fecha de fin debe ser posterior a la de inicio.</p>}

      {error && <p className="texto-error">{error}</p>}

      <button type="submit" className="btn-primary" disabled={!formularioValido || enviando}>
        {enviando ? "Enviando…" : "Enviar solicitud"}
      </button>
    </form>
  );
}