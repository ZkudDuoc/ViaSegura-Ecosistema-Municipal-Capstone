export const PERIODOS = [
    { value: "HOY", label: "Hoy" },
    { value: "SEMANA", label: "Esta semana" },
    { value: "MES", label: "Este mes" },
    { value: "RANGO", label: "Elegir fechas" },
];

function inicioDelDia(fecha) {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    return d;
}

function finDelDia(fecha) {
    const d = new Date(fecha);
    d.setHours(23, 59, 59, 999);
    return d;
}

function restarDias(fecha, dias) {
    const d = new Date(fecha);
    d.setDate(d.getDate() - dias);
    return d;
}

function fechaCorta(fecha) {
    return fecha.toLocaleDateString("es-CL", { day: "numeric", month: "long" });
}

// "YYYY-MM-DD" del input de fecha, en hora local.
function leerFecha(texto) {
    return new Date(`${texto}T00:00:00`);
}

// Fecha de hoy (± días) en formato del input de fecha.
export function fechaInput(diasDesdeHoy = 0) {
    const d = restarDias(new Date(), -diasDesdeHoy);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Período elegido y su período anterior equivalente. Se compara lo mismo con
// lo mismo: hoy hasta esta hora vs. ayer hasta esta hora, esta semana hasta
// hoy vs. la semana pasada hasta el mismo día, etc.
export function calcularPeriodo(tipo, rango = {}) {
    const ahora = new Date();

    if (tipo === "HOY") {
        const desde = inicioDelDia(ahora);
        return {
            desde,
            hasta: ahora,
            anteriorDesde: restarDias(desde, 1),
            anteriorHasta: restarDias(ahora, 1),
            nombreAnterior: "ayer",
            titulo: `Hoy, ${ahora.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}`,
        };
    }

    if (tipo === "SEMANA") {
        const desde = inicioDelDia(ahora);
        desde.setDate(desde.getDate() - ((desde.getDay() + 6) % 7)); // lunes
        return {
            desde,
            hasta: ahora,
            anteriorDesde: restarDias(desde, 7),
            anteriorHasta: restarDias(ahora, 7),
            nombreAnterior: "la semana pasada",
            titulo: `Semana del ${fechaCorta(desde)} al ${fechaCorta(ahora)}`,
        };
    }

    if (tipo === "MES") {
        const anio = ahora.getFullYear();
        const mes = ahora.getMonth();
        const diasMesAnterior = new Date(anio, mes, 0).getDate();
        return {
            desde: new Date(anio, mes, 1),
            hasta: ahora,
            anteriorDesde: new Date(anio, mes - 1, 1),
            anteriorHasta: new Date(
                anio,
                mes - 1,
                Math.min(ahora.getDate(), diasMesAnterior),
                ahora.getHours(),
                ahora.getMinutes(),
                ahora.getSeconds()
            ),
            nombreAnterior: "el mes pasado",
            titulo: `Mes de ${ahora.toLocaleDateString("es-CL", { month: "long", year: "numeric" })}`,
        };
    }

    // Rango elegido: se compara con un período de igual duración inmediatamente antes.
    const desde = inicioDelDia(leerFecha(rango.desde));
    const hasta = finDelDia(leerFecha(rango.hasta));
    // Se cuenta en días (no en horas) para no descuadrarse con el cambio de horario.
    const dias = Math.round((inicioDelDia(hasta) - desde) / 86_400_000) + 1;
    return {
        desde,
        hasta,
        anteriorDesde: inicioDelDia(restarDias(desde, dias)),
        anteriorHasta: finDelDia(restarDias(desde, 1)),
        nombreAnterior: "el período anterior",
        titulo: `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`,
    };
}