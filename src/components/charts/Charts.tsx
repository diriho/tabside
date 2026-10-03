import { Table2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

// Hand-rolled SVG charts following the dataviz mark specs: bars ≤24px with a 4px rounded
// data-end and square baseline, 2px lines, ≥8px end-dots with a 2px surface ring, hairline
// solid gridlines, selective direct labels, hover/focus tooltips, and a table view.
// Single-series charts use --chart-1 (validated for light and dark surfaces).

export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

/** Clean axis ticks: 0, step, 2·step… with step from {1, 2, 2.5, 5}×10ⁿ. */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow
  const ticks: number[] = []
  for (let v = 0; v <= max + step * 0.0001; v += step) ticks.push(Number(v.toFixed(10)))
  if (ticks[ticks.length - 1]! < max) ticks.push(ticks[ticks.length - 1]! + step)
  return ticks
}

/** Regular x labels every `every` points, plus the last one — skipping any that would crowd it. */
function showXLabel(i: number, last: number, every: number): boolean {
  if (i === last) return true
  return i % every === 0 && last - i >= Math.max(1, Math.ceil(every * 0.75))
}

/** Column with a 4px rounded top and a square baseline. */
function columnPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return ''
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

/** Horizontal bar with a 4px rounded end on the right and a square baseline on the left. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (w <= 0) return ''
  const r = Math.min(4, h / 2, w)
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`
}

export interface Datum {
  key: string
  label: string
  value: number
}

export function ChartFrame({
  title,
  subtitle,
  children,
  table,
  className,
}: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  table: { columns: [string, string]; rows: Array<[string, string]> }
  className?: string
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <figure className={cn('rounded-xl border border-line bg-surface p-5', className)}>
      <figcaption className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">{title}</h3>
          {subtitle && <p className="text-sm text-ink-2">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setShowTable(!showTable)}
          aria-pressed={showTable}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <Table2 className="size-4" /> {showTable ? 'Chart' : 'Table'}
        </button>
      </figcaption>
      {showTable ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-ink-2">
              <tr><th scope="col" className="py-1.5 text-left font-semibold">{table.columns[0]}</th><th scope="col" className="py-1.5 text-right font-semibold">{table.columns[1]}</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {table.rows.map(([a, b]) => (
                <tr key={a}><td className="py-1.5">{a}</td><td className="tnum py-1.5 text-right">{b}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </figure>
  )
}

function Tooltip({ x, y, width, value, label }: { x: number; y: number; width: number; value: string; label: string }) {
  const left = Math.min(Math.max(x, 70), width - 70)
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-center shadow-lift"
      style={{ left, top: y - 8 }}
    >
      <p className="tnum text-[14px] font-bold whitespace-nowrap">{value}</p>
      <p className="text-[12px] whitespace-nowrap text-ink-2">{label}</p>
    </div>
  )
}

/** Vertical columns over a category/time axis (e.g. revenue by day, orders by hour). */
export function ColumnChart({
  data,
  height = 220,
  formatValue,
  formatTick,
  labelEvery = 1,
  ariaLabel,
}: {
  data: Datum[]
  height?: number
  formatValue: (v: number) => string
  formatTick?: (v: number) => string
  labelEvery?: number
  ariaLabel: string
}) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(0, ...data.map((d) => d.value))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]!
  const tickFmt = formatTick ?? formatValue
  const padLeft = 8 + Math.max(...ticks.map((t) => tickFmt(t).length)) * 7
  const padBottom = 26
  const padTop = 22
  const plotW = Math.max(0, width - padLeft - 4)
  const plotH = height - padBottom - padTop
  const band = data.length ? plotW / data.length : 0
  const barW = Math.max(2, Math.min(24, band - 2)) // 2px surface gap minimum, capped at 24px
  const y = (v: number) => padTop + plotH - (top ? (v / top) * plotH : 0)
  const maxIndex = data.findIndex((d) => d.value === max && max > 0)

  return (
    <div ref={ref} className="relative w-full" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padLeft} x2={width} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={padLeft - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[11px] tnum">{tickFmt(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = padLeft + band * i + band / 2
            const h = y(0) - y(d.value)
            const active = hover === i
            return (
              <g key={d.key}>
                <path
                  d={columnPath(cx - barW / 2, y(d.value), barW, h)}
                  fill="var(--chart-1)"
                  opacity={hover === null || active ? 1 : 0.55}
                />
                {/* Hit target: the full band, taller than the mark */}
                <rect
                  x={padLeft + band * i}
                  y={padTop}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.label}: ${formatValue(d.value)}`}
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none focus-visible:stroke-[var(--focus)] focus-visible:stroke-2"
                />
                {showXLabel(i, data.length - 1, labelEvery) && (
                  <text x={cx} y={height - 8} textAnchor="middle" className="fill-ink-3 text-[11px]">{d.label}</text>
                )}
                {i === maxIndex && hover === null && (
                  <text x={cx} y={y(d.value) - 6} textAnchor="middle" className="fill-ink-2 text-[11px] font-semibold tnum">{formatValue(d.value)}</text>
                )}
              </g>
            )
          })}
          <line x1={padLeft} x2={width} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeWidth={1} shapeRendering="crispEdges" />
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={padLeft + band * hover + band / 2} y={y(data[hover].value)} width={width} value={formatValue(data[hover].value)} label={data[hover].label} />
      )}
    </div>
  )
}

/** A trend line with a light area wash, crosshair tooltip and labeled end value. */
export function LineChart({
  data,
  height = 200,
  formatValue,
  formatTick,
  labelEvery = 1,
  ariaLabel,
}: {
  data: Datum[]
  height?: number
  formatValue: (v: number) => string
  formatTick?: (v: number) => string
  labelEvery?: number
  ariaLabel: string
}) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const gradientId = useId()
  const max = Math.max(0, ...data.map((d) => d.value))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]!
  const tickFmt = formatTick ?? formatValue
  const padLeft = 8 + Math.max(...ticks.map((t) => tickFmt(t).length)) * 7
  const padRight = 12
  const padBottom = 26
  const padTop = 22
  const plotW = Math.max(0, width - padLeft - padRight)
  const plotH = height - padBottom - padTop
  const x = (i: number) => padLeft + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2)
  const y = (v: number) => padTop + plotH - (top ? (v / top) * plotH : 0)
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join('')
  const area = data.length ? `${line}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : ''
  const last = data.length - 1

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const rel = (e.clientX - rect.left) / rect.width
    setHover(Math.round(rel * last))
  }

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--chart-1)" stopOpacity={0.12} />
              <stop offset="1" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padLeft} x2={width - padRight} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={padLeft - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[11px] tnum">{tickFmt(t)}</text>
            </g>
          ))}
          {data.map((d, i) =>
            showXLabel(i, last, labelEvery) ? (
              <text key={d.key} x={x(i)} y={height - 8} textAnchor="middle" className="fill-ink-3 text-[11px]">{d.label}</text>
            ) : null,
          )}
          <path d={area} fill={`url(#${gradientId})`} />
          <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && data[hover] && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={padTop} y2={y(0)} stroke="var(--line-strong)" strokeWidth={1} />
              <circle cx={x(hover)} cy={y(data[hover].value)} r={5} fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={2} />
            </>
          )}
          {last >= 0 && hover === null && (
            <>
              <circle cx={x(last)} cy={y(data[last]!.value)} r={4.5} fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={2} />
              <text x={x(last)} y={y(data[last]!.value) - 10} textAnchor="end" className="fill-ink text-[12px] font-semibold tnum">{formatValue(data[last]!.value)}</text>
            </>
          )}
          <rect
            x={padLeft}
            y={padTop}
            width={plotW}
            height={plotH}
            fill="transparent"
            tabIndex={0}
            aria-label={`${ariaLabel}. Use left and right arrow keys to read values.`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(last)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? last) - 1))
              if (e.key === 'ArrowRight') setHover((h) => Math.min(last, (h ?? 0) + 1))
            }}
            className="outline-none focus-visible:stroke-[var(--focus)] focus-visible:stroke-2"
          />
        </svg>
      )}
      {hover !== null && data[hover] && <Tooltip x={x(hover)} y={y(data[hover].value)} width={width} value={formatValue(data[hover].value)} label={data[hover].label} />}
    </div>
  )
}

/** Ranked horizontal bars with names on the left and the value at the bar's tip. */
export function BarList({ data, formatValue, ariaLabel }: { data: Datum[]; formatValue: (v: number) => string; ariaLabel: string }) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const max = Math.max(1, ...data.map((d) => d.value))
  const rowH = 32
  const barH = 20
  const labelW = Math.min(170, Math.max(90, width * 0.36))
  const valueW = 56
  const plotW = Math.max(0, width - labelW - valueW)
  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg width={width} height={data.length * rowH} role="img" aria-label={ariaLabel} className="block">
          {data.map((d, i) => {
            const w = (d.value / max) * plotW
            const yy = i * rowH + (rowH - barH) / 2
            return (
              <g key={d.key}>
                <title>{`${d.label}: ${formatValue(d.value)}`}</title>
                <text x={0} y={yy + barH / 2} dy="0.32em" className="fill-ink text-[13px]">
                  {d.label.length > 22 ? `${d.label.slice(0, 21)}…` : d.label}
                </text>
                <path d={barPath(labelW, yy, Math.max(w, 2), barH)} fill="var(--chart-1)" />
                <text x={labelW + Math.max(w, 2) + 6} y={yy + barH / 2} dy="0.32em" className="fill-ink-2 text-[12.5px] font-semibold tnum">{formatValue(d.value)}</text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

/** Stat tile: label, value (proportional figures at display size), optional note. */
export function StatTile({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'attention' }) {
  return (
    <div className={cn('rounded-xl border bg-surface p-4', tone === 'attention' ? 'border-clay/50' : 'border-line')}>
      <p className="text-[13px] font-semibold text-ink-2">{label}</p>
      <p className="mt-1 text-[26px] leading-tight font-bold">{value}</p>
      {note && <p className="mt-0.5 text-[13px] text-ink-2">{note}</p>}
    </div>
  )
}
