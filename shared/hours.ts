// Opening hours: {"mon":[{"open":"11:30","close":"22:00"}], ...}. A close earlier than open
// means the period runs past midnight ("18:00"–"02:00").

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Day = (typeof DAYS)[number]
export interface Period { open: string; close: string }
export type OpeningHours = Partial<Record<Day, Period[]>>

export const DAY_LABELS: Record<Day, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidTime(t: string): boolean {
  return TIME.test(t)
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Local weekday + minutes-after-midnight in the restaurant's timezone. */
export function zonedNow(timeZone: string, at: Date = new Date()): { day: Day; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at)
  const weekday = (parts.find((p) => p.type === 'weekday')?.value ?? 'Mon').toLowerCase().slice(0, 3) as Day
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return { day: weekday, minutes: hour * 60 + minute }
}

export function openStatus(hours: OpeningHours, timeZone: string, at: Date = new Date()):
  { open: boolean; closesAt?: string; opensAt?: string } {
  const { day, minutes } = zonedNow(timeZone, at)
  const idx = DAYS.indexOf(day)
  const yesterday = DAYS[(idx + 6) % 7]!

  for (const p of hours[day] ?? []) {
    const o = toMinutes(p.open)
    const c = toMinutes(p.close)
    if (c > o ? minutes >= o && minutes < c : minutes >= o) return { open: true, closesAt: p.close }
  }
  for (const p of hours[yesterday] ?? []) {
    const o = toMinutes(p.open)
    const c = toMinutes(p.close)
    if (c <= o && minutes < c) return { open: true, closesAt: p.close }
  }
  const later = (hours[day] ?? []).map((p) => p.open).filter((o) => toMinutes(o) > minutes).sort()[0]
  return { open: false, opensAt: later }
}

export function formatClock(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const d = new Date(2000, 0, 1, h ?? 0, m ?? 0)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: m ? '2-digit' : undefined }).format(d)
}

export function formatPeriods(periods: Period[] | undefined): string {
  if (!periods || periods.length === 0) return 'Closed'
  return periods.map((p) => `${formatClock(p.open)} – ${formatClock(p.close)}`).join(', ')
}
