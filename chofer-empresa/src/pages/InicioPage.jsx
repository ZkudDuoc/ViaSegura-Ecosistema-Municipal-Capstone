import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { obtenerResumenEmpresa } from "../services/empresaPanelService";
import { getApiErrorMessage } from "../services/api";
import { nombreEmpresa } from "../utils/empresa";
import Icono from "../components/Icono";
import "./paginas.css";
import "./inicio.css";

const ESTADOS_PENDIENTES = ["PENDIENTE_CONFIRMACION_MUNICIPAL", "EN_COLA_ESPERA"];

function plural(n, singular, varios) {
  return `${n} ${n === 1 ? singular : varios}`;
}

// Textos de cada acceso rápido según el resumen. Sin resumen (cargando o con
// error) se muestra solo la descripción fija: la card sigue sirviendo.
function accesos(resumen) {
  const porEstado = resumen?.contadores?.por_estado ?? {};
  const pendientes = ESTADOS_PENDIENTES.reduce((total, estado) => total + (porEstado[estado] ?? 0), 0);
  const contadores = resumen?.contadores;

  return [
    {
      to: "/solicitudes",
      icono: "solicitudes",
      titulo: "Solicitudes",
      descripcion: "Revisa el estado de tus permisos",
      contador: contadores ? plural(pendientes, "esperando aprobación", "esperando aprobación") : null,
    },
    {
      to: "/solicitud",
      icono: "crear",
      titulo: "Crear solicitud",
      descripcion: "Pide un permiso nuevo",
      destacada: true,
    },
    {
      to: "/camiones",
      icono: "camion",
      titulo: "Camiones",
      descripcion: "Tus vehículos registrados",
      contador: contadores ? plural(contadores.vehiculos_activos ?? 0, "activo", "activos") : null,
    },
    {
      to: "/trabajadores",
      icono: "trabajadores",
      titulo: "Trabajadores",
      descripcion: "Tu nómina de personal",
      contador: contadores ? plural(contadores.trabajadores_activos ?? 0, "activo", "activos") : null,
    },
  ];
}

// Solo los avisos que tienen algo que mostrar, cada uno con su sección.
function avisos(resumen) {
  const alertas = resumen?.alertas ?? {};
  const porCorregir = resumen?.contadores?.por_estado?.EN_REVISION ?? 0;

  return [
    porCorregir > 0 && {
      to: "/solicitudes?grupo=en_revision",
      icono: "alerta",
      texto: `${plural(porCorregir, "solicitud necesita", "solicitudes necesitan")} que corrijas el horario`,
      accion: "Corregir",
      urgente: true,
    },
    alertas.contratos_por_vencer > 0 && {
      to: "/trabajadores",
      icono: "trabajadores",
      texto: `${plural(alertas.contratos_por_vencer, "contrato vence", "contratos vencen")} en los próximos 30 días`,
      accion: "Ver trabajadores",
    },
    alertas.epp_por_vencer > 0 && {
      to: "/trabajadores",
      icono: "trabajadores",
      texto: `${plural(alertas.epp_por_vencer, "trabajador tiene", "trabajadores tienen")} el equipo de protección (EPP) por vencer en los próximos 30 días`,
      accion: "Ver trabajadores",
    },
    alertas.multas_pendientes > 0 && {
      to: "/solicitudes?con_multas=true",
      icono: "multa",
      texto: `${plural(alertas.multas_pendientes, "multa registrada", "multas registradas")} en tus servicios`,
      accion: "Ver multas",
    },
  ].filter(Boolean);
}

export default function InicioPage() {
  const { usuario } = useAuth();
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(() => {
    setCargando(true);
    setError(null);
    obtenerResumenEmpresa()
      .then(setResumen)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const empresa = resumen?.empresa?.nombre_fantasia || resumen?.empresa?.razon_social || nombreEmpresa(usuario);
  const primerNombre = usuario?.nombre?.split(" ")[0];
  const listaAvisos = avisos(resumen);

  return (
    <div>
      <p className="inicio-saludo">Hola{primerNombre ? `, ${primerNombre}` : ""}</p>
      <h1 className="inicio-titulo">{empresa ?? "Tu empresa"}</h1>
      <p className="subtitulo">¿Qué quieres hacer hoy?</p>

      <nav className="inicio-accesos" aria-label="Accesos rápidos">
        {accesos(resumen).map((a) => (
          <Link key={a.to} to={a.to} className={"inicio-acceso" + (a.destacada ? " destacada" : "")}>
            <Icono nombre={a.icono} tamano={32} className="inicio-acceso-icono" />
            <span className="inicio-acceso-titulo">{a.titulo}</span>
            <span className="inicio-acceso-descripcion">{a.descripcion}</span>
            {a.contador && <span className="inicio-acceso-contador">{a.contador}</span>}
          </Link>
        ))}
      </nav>

      <section className="inicio-avisos" aria-labelledby="titulo-avisos" aria-live="polite">
        <h2 id="titulo-avisos" className="inicio-seccion-titulo">
          Avisos
        </h2>

        {cargando && <p className="subtitulo">Revisando si hay avisos…</p>}

        {!cargando && error && (
          <div className="card inicio-error">
            <p className="texto-error">No pudimos cargar tus avisos. {error}</p>
            <button type="button" className="btn-secondary" onClick={cargar}>
              Intentar de nuevo
            </button>
          </div>
        )}

        {!cargando && !error && listaAvisos.length === 0 && (
          <div className="card inicio-sin-avisos">Todo en orden: no tienes avisos pendientes.</div>
        )}

        {!cargando && !error && listaAvisos.length > 0 && (
          <ul className="inicio-lista-avisos">
            {listaAvisos.map((aviso) => (
              <li key={aviso.texto}>
                <Link to={aviso.to} className={"inicio-aviso" + (aviso.urgente ? " urgente" : "")}>
                  <Icono nombre={aviso.icono} className="inicio-aviso-icono" />
                  <span className="inicio-aviso-texto">{aviso.texto}</span>
                  <span className="inicio-aviso-accion">{aviso.accion}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}