import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { obtenerCumplimientoEmpresa } from "../services/empresaPanelService";
import { getApiErrorMessage } from "../services/api";
import { ListaCargando } from "../components/EstadoLista";
import { formatearFecha } from "../utils/formato";
import "./paginas.css";
import "./cumplimiento.css";

const DIAS_POR_VENCER = 30;

// Las fechas vienen como "AAAA-MM-DD": se comparan como texto, sin zona horaria.
function fechaLocal(dias = 0) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toLocaleDateString("en-CA");
}

function fechaCorta(fecha) {
  return fecha.split("-").reverse().join("-");
}

function estadoDocumento(fecha) {
  if (!fecha) return { clase: "badge-neutro", texto: "Sin fecha" };
  if (fecha < fechaLocal()) return { clase: "badge-error", texto: `Vencido el ${fechaCorta(fecha)}` };
  if (fecha <= fechaLocal(DIAS_POR_VENCER)) return { clase: "badge-pendiente", texto: `Vence el ${fechaCorta(fecha)}` };
  return { clase: "badge-ok", texto: `Vigente hasta ${fechaCorta(fecha)}` };
}

function tiempoAprobacion(horas) {
  if (horas === null || horas === undefined) return "Sin datos";
  return horas < 1 ? `${Math.round(horas * 60)} min` : `${Number(horas).toFixed(1)} h`;
}

function Indicador({ titulo, valor, detalle }) {
  return (
    <div className="card cumplimiento-indicador">
      <span className="cumplimiento-indicador-titulo">{titulo}</span>
      <strong className="cumplimiento-indicador-valor">{valor}</strong>
      {detalle && <span className="permiso-detalle">{detalle}</span>}
    </div>
  );
}

function Documento({ etiqueta, fecha }) {
  const { clase, texto } = estadoDocumento(fecha);
  return (
    <span className="cumplimiento-documento">
      {etiqueta}: <span className={`badge ${clase}`}>{texto}</span>
    </span>
  );
}

function ListaTrabajadores({ titulo, trabajadores, vacio }) {
  return (
    <section className="card paso">
      <h2 className="paso-titulo">{titulo}</h2>
      {trabajadores.length === 0 ? (
        <p className="permiso-detalle">{vacio}</p>
      ) : (
        <ul className="cumplimiento-lista">
          {trabajadores.map((t) => (
            <li key={t.id}>
              <div>
                <strong>{t.nombre}</strong>
                <span className="permiso-detalle">
                  {t.cargo ? `${t.cargo} · ` : ""}
                  {t.rut}
                </span>
              </div>
              <div className="cumplimiento-documentos">
                <Documento etiqueta="Contrato" fecha={t.contrato_vigente_hasta} />
                <Documento etiqueta="EPP" fecha={t.epp_vigente_hasta} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function CumplimientoPage() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    obtenerCumplimientoEmpresa()
      .then(setDatos)
      .catch((err) => setError(getApiErrorMessage(err)));
  }, []);

  if (error) {
    return (
      <div>
        <h1>Cumplimiento</h1>
        <p className="texto-error">{error}</p>
      </div>
    );
  }

  if (!datos) return <ListaCargando filas={3} etiqueta="Cargando el panel de cumplimiento" />;

  const { trabajadores, multas, solicitudes, tiempo_promedio_aprobacion_horas: horas } = datos;
  const porcentaje = solicitudes.total > 0 ? Math.round((solicitudes.aprobadas / solicitudes.total) * 100) : null;

  return (
    <div>
      <h1>Cumplimiento</h1>
      <p className="subtitulo">Lo que tu empresa debe tener al día antes de salir a terreno.</p>

      <div className="cumplimiento-indicadores">
        <Indicador titulo="Multas" valor={multas.total} detalle={`${multas.ultimos_30_dias} en los últimos 30 días`} />
        <Indicador
          titulo="Solicitudes aprobadas"
          valor={porcentaje === null ? "Sin datos" : `${porcentaje} %`}
          detalle={`${solicitudes.aprobadas} aprobadas · ${solicitudes.rechazadas} rechazadas`}
        />
        <Indicador titulo="Tiempo de aprobación" valor={tiempoAprobacion(horas)} detalle="Promedio" />
        <Indicador
          titulo="Por regularizar"
          valor={trabajadores.vencidos.length}
          detalle={`${trabajadores.por_vencer.length} por vencer en ${DIAS_POR_VENCER} días`}
        />
      </div>

      <ListaTrabajadores
        titulo="Contrato o EPP vencido"
        trabajadores={trabajadores.vencidos}
        vacio="Ningún trabajador tiene documentos vencidos."
      />
      <ListaTrabajadores
        titulo={`Vencen en los próximos ${DIAS_POR_VENCER} días`}
        trabajadores={trabajadores.por_vencer}
        vacio="No hay documentos por vencer."
      />

      <section className="card paso">
        <h2 className="paso-titulo">Multas recientes</h2>
        {multas.recientes.length === 0 ? (
          <p className="permiso-detalle">Tu empresa no tiene multas.</p>
        ) : (
          <ul className="cumplimiento-lista">
            {multas.recientes.map((m) => (
              <li key={m.id}>
                <div>
                  <strong>{m.descripcion}</strong>
                  <span className="permiso-detalle">{formatearFecha(m.fecha)}</span>
                </div>
                {m.permiso_id && (
                  <Link to={`/solicitudes/${m.permiso_id}`} className="enlace">
                    Ver solicitud
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}