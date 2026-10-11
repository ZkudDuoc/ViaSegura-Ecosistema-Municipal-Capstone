const ZONA_CHILE = 'America/Santiago';

const formateador = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_CHILE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

// Fecha ('AAAA-MM-DD') y hora (0-23) de un instante en hora de Chile. El
// servidor corre en UTC (Render), así que sin esto una faena a las 22:00
// en Santiago se evaluaría como "del día siguiente" y de madrugada.
function fechaYHoraSantiago(valor) {
  const instante = valor instanceof Date ? valor : new Date(valor);
  const partes = Object.fromEntries(formateador.formatToParts(instante).map((p) => [p.type, p.value]));
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    hora: Number(partes.hour),
  };
}

module.exports = { fechaYHoraSantiago, ZONA_CHILE };
