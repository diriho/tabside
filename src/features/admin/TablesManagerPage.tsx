import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, Pencil, Plus, Printer, QrCode } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageHeader, Panel } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { TableNumeral } from '@/components/ui/Display'
import { EmptyState, ErrorState, InlineAlert, PageLoader, Spinner } from '@/components/ui/Feedback'
import { Field, Input, Switch } from '@/components/ui/Form'
import { ConfirmDialog, Sheet } from '@/components/ui/Sheet'
import { useStaffContext } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { download, isDeviceLocalUrl, qrDataUrl, qrSvg, tableUrl } from '@/lib/qr'
import { archiveTable, listTables, saveTable } from '@/services/operations'
import type { RestaurantTable } from '@/types/domain'

export default function TablesManagerPage() {
  const staff = useStaffContext()
  const { id: restaurantId, slug, name: restaurantName } = staff.restaurant
  const queryClient = useQueryClient()
  const toast = useToast()
  const tables = useQuery({ queryKey: ['admin', restaurantId, 'tables'], queryFn: () => listTables(restaurantId) })
  const [editing, setEditing] = useState<RestaurantTable | 'new' | null>(null)
  const [viewing, setViewing] = useState<RestaurantTable | null>(null)
  const [printing, setPrinting] = useState(false)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', restaurantId, 'tables'] })
    void queryClient.invalidateQueries({ queryKey: ['staff', restaurantId] })
  }

  if (tables.isPending) return <PageLoader />
  if (tables.isError) return <ErrorState error={tables.error} onRetry={() => void tables.refetch()} />
  const list = tables.data

  return (
    <div>
      <PageHeader
        title="Tables & QR codes"
        description="Each table gets its own code. Guests who scan it join that table’s shared tab."
        actions={
          <>
            <Button variant="secondary" icon={<Printer className="size-4" />} disabled={list.length === 0} onClick={() => setPrinting(true)}>Print all codes</Button>
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add table</Button>
          </>
        }
      />

      {list.length === 0 ? (
        <Panel>
          <EmptyState icon={<QrCode />} title="No tables yet" body="Add your tables with how many people each seats, then print a code for each one." action={<Button onClick={() => setEditing('new')}>Add your first table</Button>} />
        </Panel>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {list.map((t) => (
            <li key={t.id} className={cn('flex flex-col rounded-xl border bg-surface p-4', t.is_active ? 'border-line' : 'border-dashed border-line-strong opacity-75')}>
              <div className="flex items-start justify-between">
                <TableNumeral label={t.label} size="lg" />
                <QrThumb url={tableUrl(slug, t.id)} onClick={() => setViewing(t)} label={`Show QR code for table ${t.label}`} />
              </div>
              <p className="mt-2 font-semibold">Seats {t.capacity}</p>
              <p className="text-sm text-ink-2">{t.is_active ? 'Taking orders' : 'Paused — scans can’t order'}</p>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="secondary" icon={<QrCode className="size-4" />} onClick={() => setViewing(t)}>QR code</Button>
                <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(t)}>Edit</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <TableEditor
        open={editing !== null}
        table={editing === 'new' ? null : editing}
        restaurantId={restaurantId}
        nextSort={list.length + 1}
        onClose={() => setEditing(null)}
        onSaved={(label) => {
          invalidate()
          toast.success(`Table ${label} saved`)
          setEditing(null)
        }}
        onArchived={(label) => {
          invalidate()
          toast.success(`Table ${label} removed`, 'Its past tabs stay in your records.')
          setEditing(null)
        }}
      />
      <QrSheet table={viewing} slug={slug} restaurantName={restaurantName} onClose={() => setViewing(null)} />
      {printing && <PrintSheet tables={list.filter((t) => t.is_active)} slug={slug} restaurantName={restaurantName} onClose={() => setPrinting(false)} />}
    </div>
  )
}

function QrThumb({ url, onClick, label }: { url: string; onClick: () => void; label: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    void qrDataUrl(url, 160).then(setSrc)
  }, [url])
  return (
    <button type="button" onClick={onClick} aria-label={label} className="size-16 overflow-hidden rounded-md border border-line bg-white p-1">
      {src ? <img src={src} alt="" className="size-full" /> : <Spinner />}
    </button>
  )
}

function TableEditor({
  open, table, restaurantId, nextSort, onClose, onSaved, onArchived,
}: {
  open: boolean
  table: RestaurantTable | null
  restaurantId: string
  nextSort: number
  onClose: () => void
  onSaved: (label: string) => void
  onArchived: (label: string) => void
}) {
  const toast = useToast()
  const [label, setLabel] = useState('')
  const [capacity, setCapacity] = useState('4')
  const [active, setActive] = useState(true)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    if (!open) return
    setLabel(table?.label ?? String(nextSort))
    setCapacity(String(table?.capacity ?? 4))
    setActive(table?.is_active ?? true)
  }, [open, table, nextSort])

  const cap = Number(capacity)
  const valid = label.trim().length > 0 && Number.isInteger(cap) && cap >= 1 && cap <= 50
  const save = useMutation({
    mutationFn: () => saveTable({ id: table?.id, restaurant_id: restaurantId, label: label.trim(), capacity: cap, is_active: active, ...(table ? {} : { sort_order: nextSort }) }),
    onSuccess: (t) => onSaved(t.label),
    onError: (err) => toast.error('Couldn’t save the table', /duplicate|already/i.test(String((err as Error).message)) ? 'Another table already uses that name.' : errorMessage(err)),
  })
  const archive = useMutation({
    mutationFn: () => archiveTable(table!.id),
    onSuccess: () => {
      setConfirm(false)
      onArchived(table!.label)
    },
    onError: (err) => toast.error('Couldn’t remove the table', errorMessage(err)),
  })

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="sm"
      title={table ? `Edit table ${table.label}` : 'New table'}
      footer={
        <div className="flex items-center gap-2">
          {table && <Button variant="quiet" onClick={() => setConfirm(true)}>Remove table</Button>}
          <div className="flex-1" />
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>Save</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Table number or name" hint="Shown to guests and staff, e.g. 12 or Patio 3.">
          {(p) => <Input {...p} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} data-autofocus />}
        </Field>
        <Field label="Seats" error={capacity && !valid && label.trim() ? 'Between 1 and 50' : null}>
          {(p) => <Input {...p} type="number" min={1} max={50} value={capacity} onChange={(e) => setCapacity(e.target.value)} className="w-28" />}
        </Field>
        <Switch checked={active} onChange={setActive} label="Taking orders" description="Pause a table (for example while it’s reserved) without reprinting its code." />
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => archive.mutate()}
        loading={archive.isPending}
        title={`Remove table ${table?.label}?`}
        body={<p>Its QR code stops working. Past tabs for this table stay in your records.</p>}
        confirmLabel="Remove table"
      />
    </Sheet>
  )
}

function QrSheet({ table, slug, restaurantName, onClose }: { table: RestaurantTable | null; slug: string; restaurantName: string; onClose: () => void }) {
  const toast = useToast()
  const [src, setSrc] = useState<string | null>(null)
  const url = table ? tableUrl(slug, table.id) : ''
  useEffect(() => {
    setSrc(null)
    if (table) void qrDataUrl(url, 960).then(setSrc)
  }, [table, url])
  if (!table) return null
  const fileBase = `${slug}-table-${table.label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <Sheet open onClose={onClose} title={`Table ${table.label}`} description="Guests scan this to join the table’s tab." size="sm">
      <div className="flex flex-col items-center pb-2">
        <div className="w-full max-w-72 rounded-xl border border-line bg-white p-4 text-[#2A1E17]">
          <p className="text-center text-sm font-semibold">{restaurantName}</p>
          {src ? <img src={src} alt={`QR code for table ${table.label}`} className="mx-auto mt-2 aspect-square w-full" /> : <div className="aspect-square" />}
          <p className="display mt-2 text-center text-3xl font-extrabold">Table {table.label}</p>
          <p className="text-center text-sm">Scan to order and pay</p>
        </div>
        <p className="mt-3 max-w-full text-center text-[13px] break-all text-ink-3">{url}</p>
        {isDeviceLocalUrl(url) && <LocalUrlWarning className="mt-3" />}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button size="sm" variant="secondary" icon={<Download className="size-4" />} disabled={!src} onClick={() => src && download(`${fileBase}.png`, src)}>PNG</Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Download className="size-4" />}
            onClick={async () => {
              const svg = await qrSvg(url)
              const href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
              download(`${fileBase}.svg`, href)
              setTimeout(() => URL.revokeObjectURL(href), 1000)
            }}
          >
            SVG
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Copy className="size-4" />}
            onClick={async () => {
              await navigator.clipboard.writeText(url)
              toast.success('Link copied')
            }}
          >
            Copy link
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/** Print-ready table tents, two per row on A4/Letter. */
/** Shown when codes point at localhost — phones scanning them would look at themselves. */
function LocalUrlWarning({ className }: { className?: string }) {
  return (
    <InlineAlert tone="warning" className={className}>
      <p className="font-semibold">Phones can’t open this code</p>
      <p className="mt-0.5">
        It points to <span className="font-semibold">localhost</span>, which on a phone means the phone itself. Open this admin page
        through an address your phone can reach — your tunnel’s https address, or run <code>npm run dev:lan</code> and use the
        network address it prints — and the codes update automatically.
      </p>
    </InlineAlert>
  )
}

function PrintSheet({ tables, slug, restaurantName, onClose }: { tables: RestaurantTable[]; slug: string; restaurantName: string; onClose: () => void }) {
  const [codes, setCodes] = useState<Record<string, string>>({})
  useEffect(() => {
    void Promise.all(tables.map(async (t) => [t.id, await qrDataUrl(tableUrl(slug, t.id), 720)] as const)).then((pairs) => setCodes(Object.fromEntries(pairs)))
  }, [tables, slug])
  const ready = Object.keys(codes).length === tables.length

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title="Print QR codes"
      description={`${tables.length} active ${tables.length === 1 ? 'table' : 'tables'}. Cut along the dashed lines and place one on each table.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button icon={<Printer className="size-4" />} disabled={!ready} onClick={() => window.print()}>Print</Button>
        </div>
      }
    >
      {tables[0] && isDeviceLocalUrl(tableUrl(slug, tables[0].id)) && <LocalUrlWarning className="mb-4" />}
      <div className="print-area grid grid-cols-2 gap-3">
        {tables.map((t) => (
          <div key={t.id} className="print-card flex flex-col items-center rounded-lg border-2 border-dashed border-line-strong bg-white p-5 text-[#2A1E17]">
            <p className="text-sm font-semibold">{restaurantName}</p>
            {codes[t.id] ? <img src={codes[t.id]} alt="" className="my-2 aspect-square w-full max-w-56" /> : <div className="my-2 aspect-square w-full max-w-56" />}
            <p className="display text-4xl font-extrabold">Table {t.label}</p>
            <p className="text-sm">Scan to order and pay. No app needed.</p>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
