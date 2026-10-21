// La app es para clientes en Lima. Todas las fechas de calendario ('YYYY-MM-DD')
// se calculan en esta zona — nunca con toISOString(), que usa UTC y adelanta
// el día después de las 19:00 en Lima. Funciona igual en servidor (UTC en
// Vercel) y en el navegador.
export const ZONA_HORARIA = 'America/Lima'

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function partesLima(date: Date): { year: number; month: number; day: number } {
  const parts = formatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** Fecha de hoy en Lima como 'YYYY-MM-DD'. */
export function hoyLima(): string {
  const { year, month, day } = partesLima(new Date())
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Año y mes (0-based, como Date#getMonth) actuales en Lima. */
export function mesActualLima(): { year: number; month: number } {
  const { year, month } = partesLima(new Date())
  return { year, month: month - 1 }
}

/** Lunes de la semana actual en Lima como 'YYYY-MM-DD'. */
export function inicioSemanaLima(): string {
  const hoy = hoyLima()
  const [y, m, d] = hoy.split('-').map(Number)
  const diaSemana = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = domingo
  return sumarDias(hoy, -((diaSemana + 6) % 7))
}

/** Suma (o resta, con negativos) días a una fecha 'YYYY-MM-DD'. */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}
