import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useResumen } from "../context/ResumenContext";
import { calcularMetricas, avisosDeAtencion, textoMinutos } from "../utils/resumen";
import Icono from "../components/Icono";
import "./InicioPage.css";

const MAX_AVISOS = 6;

function saludo(fecha) {
  const hora = fecha.getHours();
  if (hora < 12) return "Buenos días";
  if (hora < 20) return "Buenas tardes";
  return "Buenas noches";
}

// Vuelve a dibujar cada minuto, para que los "hace X min" no queden congelados.
function useAhora() {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(intervalo);
  }, []);
  return ahora;
}

// `color` = la franja de arriba (azul, celeste, rojo o amarillo), para
// distinguir cada número de un vistazo.
function Metrica({ to, titulo, valor, detalle, tono, color, icono, cargando }) {
  return (
    <Link to={to} className={`inicio-metrica metrica-${color}` + (tono ? ` ${tono}` : "")}>
      <span className="inicio-metrica-cabecera">
        <span className="inicio-metrica-titulo">{titulo}</span>
        <span className="inicio-metrica-icono">
          <Icono nombre={icono} tamano={18} />
        </span>
      </span>
      {cargando ? (
        <>
          <span className="esqueleto inicio-metrica-esqueleto-valor" aria-hidden="true" />
          <span className="esqueleto inicio-metrica-esqueleto-detalle" aria-hidden="true" />
        </>
      ) : (
        <>
          <span className="inicio-metrica-valor">{valor ?? "—"}</span>
          <span className="inicio-metrica-detalle">{valor === null ? "No se pudo cargar" : detalle}</span>
        </>
      )}
    </Link>
  );
}

export default function InicioPage() {
  const { usuario } = useAuth();
  const resumen = useResumen();
  const navigate = useNavigate();
  const ahora = useAhora();

  const metricas = calcularMetricas(resumen, ahora);
  const avisos = avisosDeAtencion(resumen, ahora);
  const primerNombre = usuario?.nombre?.split(" ")[0];
  const fecha = new Date(ahora).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });

  const abrirAviso = (aviso) => {
    if (aviso.foco) navigate("/operador", { state: { foco: aviso.foco } });
    else navigate(aviso.to);
  };

  const diferenciaMultas = (metricas.multasHoy ?? 0) - metricas.multasAyer;

  return (
    <div className="inicio">
      <p className="inicio-saludo">
        {saludo(new Date(ahora))}
        {primerNombre ? `, ${primerNombre}` : ""} · {fecha}
      </p>
      <h1 className="inicio-titulo">Resumen de hoy</h1>
      {resumen.actualizado && (
        <p className="inicio-actualizado">
          Actualizado a las{" "}
          {resumen.actualizado.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false })}. Se
          actualiza solo.
        </p>
      )}

      <section className="inicio-metricas" aria-label="Números del día">
        <Metrica
          to="/operador"
          titulo="Por decidir"
          color="azul"
          icono="bandeja"
          cargando={resumen.cargando}
          valor={metricas.porDecidir}
          detalle={metricas.emergencias ? `${metricas.emergencias} de emergencia` : "Sin emergencias"}
          tono={metricas.emergencias ? "alerta" : null}
        />
        <Metrica
          to="/operador"
          titulo="En terreno ahora"
          color="celeste"
          icono="camion"
          cargando={resumen.cargando}
          valor={metricas.enTerreno}
          detalle={
            metricas.excedidos
              ? `${metricas.excedidos} fuera de horario`
              : metricas.porTerminar
                ? `${metricas.porTerminar} por terminar`
                : "Todos dentro de su horario"
          }
          tono={metricas.excedidos ? "alerta" : null}
        />
        <Metrica
          to="/operador"
          titulo="Alertas de pánico"
          color="rojo"
          icono="alerta"
          cargando={resumen.cargando}
          valor={metricas.alertas}
          detalle={metricas.alertas ? `La más antigua, hace ${textoMinutos(metricas.alertaMasAntigua)}` : "Ninguna abierta"}
          tono={metricas.alertas ? "peligro" : null}
        />
        <Metrica
          to="/multas"
          titulo="Multas de hoy"
          color="amarillo"
          icono="multa"
          cargando={resumen.cargando}
          valor={metricas.multasHoy}
          detalle={
            diferenciaMultas === 0
              ? "Igual que ayer"
              : `${diferenciaMultas > 0 ? "+" : ""}${diferenciaMultas} respecto de ayer`
          }
        />
      </section>

      <section className="inicio-seccion" aria-labelledby="titulo-atencion">
        <h2 id="titulo-atencion" className="inicio-seccion-titulo">
          Necesita tu atención
        </h2>

        {resumen.cargando && (
          <div className="inicio-avisos-cargando" aria-busy="true" aria-label="Revisando si hay algo urgente">
            <div className="esqueleto" />
            <div className="esqueleto" />
          </div>
        )}

        {!resumen.cargando && avisos.length === 0 && (
          <div className="inicio-todo-bien">
            <span className="inicio-todo-bien-icono" aria-hidden="true">
              <Icono nombre="check" tamano={18} />
            </span>
            Todo en orden: no hay nada urgente por ahora.
          </div>
        )}

        {avisos.length > 0 && (
          <ul className="inicio-avisos">
            {avisos.slice(0, MAX_AVISOS).map((aviso) => (
              <li key={aviso.clave}>
                <button type="button" className={`inicio-aviso ${aviso.tono}`} onClick={() => abrirAviso(aviso)}>
                  <span className="inicio-aviso-icono">
                    <Icono nombre={aviso.icono} tamano={20} />
                  </span>
                  <span className="inicio-aviso-texto">{aviso.texto}</span>
                  <span className="inicio-aviso-accion">{aviso.accion}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {avisos.length > MAX_AVISOS && (
          <Link to="/operador" className="inicio-ver-todo">
            {avisos.length - MAX_AVISOS === 1
              ? "Hay 1 aviso más: ver en la bandeja"
              : `Hay ${avisos.length - MAX_AVISOS} avisos más: ver en la bandeja`}
          </Link>
        )}
      </section>

      <section className="inicio-seccion" aria-labelledby="titulo-accesos">
        <h2 id="titulo-accesos" className="inicio-seccion-titulo">
          Accesos rápidos
        </h2>
        <div className="inicio-accesos">
          <Link to="/operador" className="inicio-acceso">
            <span className="inicio-acceso-icono">
              <Icono nombre="bandeja" tamano={22} />
            </span>
            <span>
              <strong>Bandeja de decisiones</strong>
              <small>Aprobar, rechazar y revisar solicitudes</small>
            </span>
          </Link>
          <Link to="/operador" state={{ verCalles: true }} className="inicio-acceso">
            <span className="inicio-acceso-icono">
              <Icono nombre="mapa" tamano={22} />
            </span>
            <span>
              <strong>Mapa y calles de riesgo</strong>
              <small>Servicios en terreno y calles de Santiago Centro</small>
            </span>
          </Link>
          <Link to="/multas" className="inicio-acceso">
            <span className="inicio-acceso-icono">
              <Icono nombre="multa" tamano={22} />
            </span>
            <span>
              <strong>Multas</strong>
              <small>Infracciones cursadas por los supervisores</small>
            </span>
          </Link>
          <Link to="/reporteria" className="inicio-acceso">
            <span className="inicio-acceso-icono">
              <Icono nombre="reporte" tamano={22} />
            </span>
            <span>
              <strong>Reportería</strong>
              <small>Números del período y descargas</small>
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}