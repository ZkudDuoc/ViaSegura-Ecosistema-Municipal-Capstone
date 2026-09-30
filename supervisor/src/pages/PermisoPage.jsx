import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { obtenerPermiso, validarPatente, obtenerOperativo, listarInspecciones } from "../services/permisoService";
import { getApiErrorMessage } from "../services/api";
import {
  ESTADO_LABEL,
  ESTADO_CLASE,
  RESULTADO_INSPECCION_LABEL,
  RESULTADO_INSPECCION_CLASE,
  formatearFecha,
} from "../utils/formato";
import "./paginas.css";
import "./supervisor.css";

const ESTADOS_VIGENTES = ["APROBADO", "ACTIVO", "ACTIVO_PENDIENTE_EVIDENCIA"];

// Un permiso habilita a circular si está aprobado o en operativo y dentro de su ventana horaria.
function evaluarVigencia(permiso, ahora = new Date()) {
  if (!ESTADOS_VIGENTES.includes(permiso.estado)) {
    return { vigente: false, motivo: `Permiso ${ESTADO_LABEL[permiso.estado]?.toLowerCase() ?? permiso.estado}` };
  }
  if (ahora < new Date(permiso.ventana_inicio)) {
    return { vigente: false, motivo: "La ventana horaria todavía no comienza" };
  }
  if (ahora > new Date(permiso.ventana_fin)) {
    return { vigente: false, motivo: "La ventana horaria ya terminó" };
  }
  return {
    vigente: true,
    motivo: permiso.estado === "APROBADO" ? "Aprobado, trabajo aún no iniciado" : "Trabajo en operativo",
  };
}

function normalizarPatente(patente) {
  return patente.replace(/[\s-]/g, "").toUpperCase();
}

function Indicador({ ok, textoOk, textoNo }) {
  return <span className={"indicador " + (ok ? "ok" : "no")}>{ok ? textoOk : textoNo}</span>;
}

export default function PermisoPage() {
  const { id } = useParams();
  const [permiso, setPermiso] = useState(null);
  const [operativo, setOperativo] = useState(null);
  const [inspecciones, setInspecciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [patente, setPatente] = useState("");
  const [validando, setValidando] = useState(false);
  const [validacion, setValidacion] = useState(null);
  const [errorPatente, setErrorPatente] = useState(null);

  useEffect(() => {
    obtenerPermiso(id)
      .then((encontrado) => {
        setPermiso(encontrado);
        if (encontrado?.geofencing_confirmado_at) {
          obtenerOperativo(id).then(setOperativo).catch(() => {});
        }
        listarInspecciones(id).then(setInspecciones).catch(() => {});
      })
      .catch((err) => {
        if (err?.response?.status === 404 || err?.response?.status === 403) setPermiso(null);
        else setError(getApiErrorMessage(err));
      })
      .finally(() => setCargando(false));
  }, [id]);

  const handleValidar = async (e) => {
    e.preventDefault();
    setErrorPatente(null);
    setValidacion(null);
    setValidando(true);
    try {
      setValidacion(await validarPatente(id, normalizarPatente(patente)));
    } catch (err) {
      setErrorPatente(
        err?.response?.status === 409
          ? "Este permiso no tiene un camión asociado (solicitud creada antes del registro de camiones)"
          : getApiErrorMessage(err)
      );
    } finally {
      setValidando(false);
    }
  };

  if (cargando) return <p className="subtitulo">Cargando permiso…</p>;

  if (!permiso) {
    return (
      <div>
        <h1>Permiso no encontrado</h1>
        <div className="veredicto no-vigente">
          <strong>NO VÁLIDO</strong>
          <span>{error ?? "El permiso no existe o no pertenece a tu comuna"}</span>
        </div>
        <Link to="/" className="btn-secondary btn-accion">
          Escanear otro
        </Link>
      </div>
    );
  }

  const vigencia = evaluarVigencia(permiso);
  const tieneFoto = permiso.foto_evidencia_url?.startsWith("data:image") || permiso.foto_evidencia_url?.startsWith("http");
  const vehiculos = [permiso.vehiculo, ...(permiso.vehiculos_adicionales ?? [])].filter(Boolean);

  return (
    <div>
      <div className="encabezado-fila">
        <h1>Permiso {permiso.id.slice(0, 8).toUpperCase()}</h1>
        <span className={`badge ${ESTADO_CLASE[permiso.estado] ?? ""}`}>
          {ESTADO_LABEL[permiso.estado] ?? permiso.estado}
        </span>
      </div>

      <div className={"veredicto " + (vigencia.vigente ? "vigente" : "no-vigente")}>
        <strong>{vigencia.vigente ? "VIGENTE" : "NO VIGENTE"}</strong>
        <span>{vigencia.motivo}</span>
      </div>

      <section className="card paso">
        <h2 className="paso-titulo">Validar patente</h2>
        <form onSubmit={handleValidar}>
          <div className="campo">
            <label htmlFor="patente">Patente del camión en terreno</label>
            <input
              id="patente"
              value={patente}
              onChange={(e) => setPatente(e.target.value)}
              placeholder="Ej: ABCD12"
              autoCapitalize="characters"
              autoComplete="off"
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={!patente.trim() || validando}>
            {validando ? "Validando…" : "Validar patente"}
          </button>
        </form>

        {validacion &&
          (validacion.coincide ? (
            <p className="texto-exito resultado-patente">La patente coincide con la del permiso</p>
          ) : (
            <p className="texto-error resultado-patente">
              No coincide: el permiso es para la patente {validacion.patente_permiso}
            </p>
          ))}
        {errorPatente && <p className="texto-error resultado-patente">{errorPatente}</p>}
      </section>

      <Link
        to={`/permisos/${permiso.id}/inspeccion`}
        state={{ patenteCoincide: validacion ? validacion.coincide : null }}
        className="btn-primary btn-accion btn-inspeccion"
      >
        Inspección en terreno
      </Link>

      <section className="card paso">
        <h2 className="paso-titulo">Datos del permiso</h2>
        <dl className="datos-permiso">
          <div>
            <dt>RUT ejecutor</dt>
            <dd>{permiso.rut_ejecutor}</dd>
          </div>
          <div>
            <dt>Empresa</dt>
            <dd>{permiso.nombre_empresa_ejecutora ?? "Persona natural / no informada"}</dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd>{permiso.tipo_actividad === "EMERGENCIA" ? "Emergencia" : "Programada"}</dd>
          </div>
          <div>
            <dt>Riesgo</dt>
            <dd>{permiso.riesgo ? `${permiso.riesgo.nivel} (score ${permiso.riesgo.score})` : "Sin evaluar"}</dd>
          </div>
          <div>
            <dt>Desde</dt>
            <dd>{formatearFecha(permiso.ventana_inicio)}</dd>
          </div>
          <div>
            <dt>Hasta</dt>
            <dd>{formatearFecha(permiso.ventana_fin)}</dd>
          </div>
          {permiso.altura_estimada_m != null && (
            <div>
              <dt>Altura declarada</dt>
              <dd>{Number(permiso.altura_estimada_m)} m</dd>
            </div>
          )}
          {operativo && (
            <div>
              <dt>Tiempo restante</dt>
              <dd>
                {operativo.restante_min >= 0
                  ? `${operativo.restante_min} min`
                  : `Excedido por ${-operativo.restante_min} min`}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <section className="card paso">
        <h2 className="paso-titulo">Personal registrado</h2>
        {permiso.personal?.length ? (
          <ul className="lista-registrados">
            {permiso.personal.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{p.nombre ?? "Sin nombre"}</strong>
                  <span className="permiso-detalle">{p.rut}</span>
                </div>
                <div className="indicadores">
                  <Indicador ok={p.contrato_vigente} textoOk="Contrato al día" textoNo="Sin contrato" />
                  <Indicador ok={p.epp_al_dia} textoOk="EPP al día" textoNo="EPP vencido" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="permiso-detalle">La solicitud no declaró personal.</p>
        )}
      </section>

      <section className="card paso">
        <h2 className="paso-titulo">Vehículos y maquinaria registrados</h2>
        {vehiculos.length ? (
          <ul className="lista-registrados">
            {vehiculos.map((v) => (
              <li key={v.patente}>
                <strong className="patente">{v.patente}</strong>
                <span className="permiso-detalle">
                  {Number(v.largo_m)} × {Number(v.ancho_m)} m · {Number(v.alto_m)} m alto
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="permiso-detalle">La solicitud no declaró vehículos.</p>
        )}
      </section>

      {tieneFoto && (
        <section className="card paso">
          <h2 className="paso-titulo">Foto de evidencia del chofer</h2>
          <img src={permiso.foto_evidencia_url} alt="Foto de evidencia al iniciar el trabajo" className="foto-preview" />
        </section>
      )}

      {inspecciones.length > 0 && (
        <section className="card paso">
          <h2 className="paso-titulo">Inspecciones anteriores</h2>
          <ul className="lista-registrados">
            {inspecciones.map((i) => (
              <li key={i.id}>
                <div>
                  <span className={`badge ${RESULTADO_INSPECCION_CLASE[i.resultado] ?? ""}`}>
                    {RESULTADO_INSPECCION_LABEL[i.resultado] ?? i.resultado}
                  </span>
                  {i.observaciones && <span className="permiso-detalle">{i.observaciones}</span>}
                </div>
                <span className="permiso-detalle">{formatearFecha(i.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link to={`/multas/nueva?permiso=${permiso.id}`} className="btn-primary btn-accion btn-multa">
        Registrar multa
      </Link>

      <Link to="/" className="btn-secondary btn-accion">
        Escanear otro permiso
      </Link>
    </div>
  );
}