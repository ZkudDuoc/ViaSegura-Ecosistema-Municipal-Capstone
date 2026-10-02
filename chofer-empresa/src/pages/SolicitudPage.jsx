import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { crearPermiso } from "../services/permisoService";
import { listarComunas } from "../services/catalogService";
import { listarVehiculos } from "../services/vehiculoService";
import { getApiErrorMessage } from "../services/api";
import { DISTANCIA_CONOS_M } from "../utils/geo";
import { ESTADO_LABEL } from "../utils/formato";
import { normalizarRut, validarRut } from "../utils/rut";
import UbicacionPicker from "../components/UbicacionPicker";
import PersonalEditor, { personaVacia } from "../components/PersonalEditor";
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
  const [rutEjecutor, setRutEjecutor] = useState(usuario?.rut ?? "");
  const [ventanaInicio, setVentanaInicio] = useState("");
  const [ventanaFin, setVentanaFin] = useState("");
  const [areaCalculada, setAreaCalculada] = useState(null);
  const [personal, setPersonal] = useState(() => [personaVacia("Chofer")]);

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

  const personalCompleto = personal.every((p) => p.nombre.trim() && validarRut(p.rut));
  const hayChofer = personal.some((p) => p.cargo === "Chofer");

  const formularioValido =
    vehiculo &&
    areaCalculada &&
    comunaId &&
    rutEjecutor.trim() &&
    ventanaInicio &&
    ventanaFin &&
    !ventanaInvalida &&
    personal.length > 0 &&
    personalCompleto &&
    hayChofer;

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
        // `cargo` todavía no se guarda en el Backend (falta la columna en
        // personal_faena); se envía para que quede apenas exista.
        personal: personal.map((p) => ({
          nombre: p.nombre.trim(),
          rut: normalizarRut(p.rut),
          cargo: p.cargo,
          contrato_vigente: p.contrato_vigente,
          epp_al_dia: p.epp_al_dia,
        })),
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
          <label htmlFor="rut">RUT del ejecutor (empresa o persona responsable)</label>
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
        <h2 className="paso-titulo">4. Personal a cargo</h2>
        <p className="permiso-detalle">
          Chofer y trabajadores que irán a terreno. Debe haber al menos un chofer.
        </p>
        <PersonalEditor personal={personal} onChange={setPersonal} />
        {!hayChofer && <p className="texto-error">Falta indicar quién es el chofer.</p>}
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
          Para enviar: camión, ubicación, comuna, fechas y el personal con nombre y RUT válido.
        </p>
      )}
    </form>
  );
}