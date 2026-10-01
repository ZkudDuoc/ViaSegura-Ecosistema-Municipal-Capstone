import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listarPermisos } from "../services/permisoService";
import { crearInfraccion, esEndpointNoDisponible } from "../services/infraccionService";
import { getApiErrorMessage } from "../services/api";
import { obtenerPosicion } from "../utils/geo";
import { comprimirFoto } from "../utils/foto";
import "./paginas.css";
import "./supervisor.css";

const TIPOS_INFRACCION = [
  "Circulación sin permiso vigente",
  "Patente no coincide con el permiso",
  "Trabajo fuera del área autorizada",
  "Trabajo fuera del horario autorizado",
  "Falta de señalización o conos de seguridad",
  "Vehículo excede las dimensiones declaradas",
  "Otra",
];

export default function NuevaMultaPage() {
  const [searchParams] = useSearchParams();
  const permisoId = searchParams.get("permiso");

  const [permiso, setPermiso] = useState(null);
  const [rutInfractor, setRutInfractor] = useState("");
  const [tipo, setTipo] = useState("");
  const [observacion, setObservacion] = useState("");
  const [foto, setFoto] = useState(null);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [creada, setCreada] = useState(null);

  // Si viene desde un permiso escaneado, se precargan sus datos.
  useEffect(() => {
    if (!permisoId) return;
    listarPermisos()
      .then((lista) => {
        const encontrado = lista.find((p) => p.id === permisoId) ?? null;
        setPermiso(encontrado);
        if (encontrado) setRutInfractor(encontrado.rut_ejecutor);
      })
      .catch(() => { });
  }, [permisoId]);

  const handleFoto = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setError(null);
    try {
      setFoto(await comprimirFoto(archivo));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      // La tabla infraccion exige la ubicación: se toma en el momento de registrar.
      const posicion = await obtenerPosicion();
      const infraccion = await crearInfraccion({
        permiso_id: permiso?.id ?? undefined,
        rut_infractor: rutInfractor.trim(),
        descripcion: observacion.trim() ? `${tipo} — ${observacion.trim()}` : tipo,
        ubicacion: { lat: posicion.lat, lng: posicion.lng },
        evidencia_url: foto ?? undefined,
      });
      setCreada(infraccion);
    } catch (err) {
      if (esEndpointNoDisponible(err)) {
        setError("El registro de multas todavía no está disponible en el servidor.");
      } else {
        setError(err.response ? getApiErrorMessage(err) : err.message);
      }
    } finally {
      setGuardando(false);
    }
  };

  if (creada) {
    return (
      <div className="card">
        <h1>Multa registrada</h1>
        <p className="texto-exito">
          {tipo} · RUT {rutInfractor}
        </p>
        {permiso && (
          <Link to={`/permisos/${permiso.id}`} className="btn-primary btn-accion">
            Volver al permiso
          </Link>
        )}
        <Link to="/multas" className="btn-secondary btn-accion">
          Ver multas
        </Link>
        <Link to="/" className="btn-secondary btn-accion">
          Escanear otro permiso
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Registrar multa</h1>
      <p className="subtitulo">
        {permiso
          ? `Asociada al permiso ${permiso.id.slice(0, 8).toUpperCase()}`
          : "Sin permiso asociado (camión sin permiso o no encontrado)"}
      </p>

      <div className="campo">
        <label htmlFor="rut">RUT del infractor</label>
        <input
          id="rut"
          value={rutInfractor}
          onChange={(e) => setRutInfractor(e.target.value)}
          placeholder="12345678-9"
          required
        />
      </div>

      <div className="campo">
        <label htmlFor="tipo">Tipo de infracción</label>
        <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} required>
          <option value="">Selecciona el tipo</option>
          {TIPOS_INFRACCION.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="observacion">Observación {tipo === "Otra" ? "" : "(opcional)"}</label>
        <textarea
          id="observacion"
          rows={3}
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          placeholder="Detalle de lo observado en terreno"
          required={tipo === "Otra"}
        />
      </div>

      <section className="card paso">
        <h2 className="paso-titulo">Foto de evidencia (opcional)</h2>
        {foto && <img src={foto} alt="Evidencia de la infracción" className="foto-preview" />}
        <label className="btn-secondary btn-archivo">
          {foto ? "Tomar otra foto" : "Tomar foto"}
          <input type="file" accept="image/*" capture="environment" onChange={handleFoto} hidden />
        </label>
      </section>

      <p className="permiso-detalle">La ubicación GPS se registra automáticamente al guardar.</p>

      {error && <p className="texto-error">{error}</p>}

      <button type="submit" className="btn-primary" disabled={!rutInfractor.trim() || !tipo || guardando}>
        {guardando ? "Registrando…" : "Registrar multa"}
      </button>
    </form>
  );
}