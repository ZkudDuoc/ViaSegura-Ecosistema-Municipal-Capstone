import { codigoCorto } from "./permisos";

export const ESTADOS_POR_DECIDIR = ["PENDIENTE_CONFIRMACION_MUNICIPAL", "EN_COLA_ESPERA"];
const MINUTOS_DEMORA = 60;
const MINUTOS_POR_TERMINAR = 15;

const minutosDesde = (iso, ahora) => Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60000));

export function textoMinutos(min) {
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  return `${horas} h ${min % 60} min`;
}

const mismoDia = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Los 4 números del Inicio. Cada uno es null si su fuente no respondió.
export function calcularMetricas({ permisos, operativos, alertas, multas }, ahora = Date.now()) {
  const porDecidir = permisos?.filter((p) => ESTADOS_POR_DECIDIR.includes(p.estado)) ?? null;
  const hoy = new Date(ahora);
  const ayer = new Date(ahora - 86_400_000);

  return {
    porDecidir: porDecidir?.length ?? null,
    emergencias: porDecidir?.filter((p) => p.tipo_actividad === "EMERGENCIA").length ?? 0,
    enTerreno: operativos?.length ?? null,
    excedidos: operativos?.filter((o) => o.restante_min < 0).length ?? 0,
    porTerminar: operativos?.filter((o) => o.restante_min >= 0 && o.restante_min <= MINUTOS_POR_TERMINAR).length ?? 0,
    alertas: alertas?.length ?? null,
    alertaMasAntigua: alertas?.length
      ? Math.max(...alertas.map((a) => minutosDesde(a.activado_at, ahora)))
      : null,
    multasHoy: multas?.filter((m) => mismoDia(new Date(m.fecha), hoy)).length ?? null,
    multasAyer: multas?.filter((m) => mismoDia(new Date(m.fecha), ayer)).length ?? 0,
  };
}

// "Necesita tu atención": lo urgente primero. Cada aviso trae a dónde llevar
// al operador (`to`) o el punto del mapa a enfocar (`foco`).
export function avisosDeAtencion({ permisos, operativos, alertas }, ahora = Date.now()) {
  const avisos = [];

  (alertas ?? []).forEach((a) => {
    const [lng, lat] = a.ubicacion?.coordinates ?? [];
    avisos.push({
      clave: `alerta-${a.id}`,
      tono: "peligro",
      icono: "alerta",
      texto: `Alerta de pánico${a.nombre ? ` de ${a.nombre}` : ""} hace ${textoMinutos(minutosDesde(a.activado_at, ahora))}`,
      accion: lat != null ? "Ver en el mapa" : "Ver solicitud",
      foco: lat != null ? { lat, lng, clave: a.id } : null,
      to: `/solicitudes/${a.permiso_id}`,
    });
  });

  const porDecidir = (permisos ?? []).filter((p) => ESTADOS_POR_DECIDIR.includes(p.estado));

  porDecidir
    .filter((p) => p.tipo_actividad === "EMERGENCIA")
    .forEach((p) =>
      avisos.push({
        clave: `emergencia-${p.id}`,
        tono: "alerta",
        icono: "alerta",
        texto: `Emergencia ${codigoCorto(p.id)} esperando decisión hace ${textoMinutos(minutosDesde(p.created_at, ahora))}`,
        accion: "Decidir",
        to: `/solicitudes/${p.id}`,
      })
    );

  (operativos ?? [])
    .filter((o) => o.restante_min < 0)
    .forEach((o) =>
      avisos.push({
        clave: `excedido-${o.id}`,
        tono: "alerta",
        icono: "reloj",
        texto: `El servicio ${codigoCorto(o.id)} se pasó de su horario por ${textoMinutos(-o.restante_min)}`,
        accion: "Revisar",
        to: `/solicitudes/${o.id}`,
      })
    );

  const faltaMovil = (p) => p.estado === "EN_COLA_ESPERA" && p.motivo_cola === "RIESGO_ALTO_SIN_MOVIL";

  porDecidir
    .filter((p) => p.tipo_actividad !== "EMERGENCIA" && p.riesgo === "Alto" && !faltaMovil(p))
    .forEach((p) =>
      avisos.push({
        clave: `alto-${p.id}`,
        tono: "alerta",
        icono: "alerta",
        texto: `Solicitud ${codigoCorto(p.id)} de riesgo alto espera tu decisión`,
        accion: "Decidir",
        to: `/solicitudes/${p.id}`,
      })
    );

  porDecidir
    .filter(faltaMovil)
    .forEach((p) =>
      avisos.push({
        clave: `movil-${p.id}`,
        tono: "info",
        icono: "camion",
        texto: `La solicitud ${codigoCorto(p.id)} necesita un móvil de escolta`,
        accion: "Asignar",
        to: `/solicitudes/${p.id}`,
      })
    );

  const demoradas = porDecidir.filter(
    (p) => p.tipo_actividad !== "EMERGENCIA" && p.riesgo !== "Alto" && minutosDesde(p.created_at, ahora) >= MINUTOS_DEMORA
  );
  if (demoradas.length) {
    avisos.push({
      clave: "demoradas",
      tono: "info",
      icono: "reloj",
      texto: `${demoradas.length} ${demoradas.length === 1 ? "solicitud espera" : "solicitudes esperan"} hace más de 1 hora`,
      accion: "Ir a la bandeja",
      to: "/operador",
    });
  }

  return avisos;
}