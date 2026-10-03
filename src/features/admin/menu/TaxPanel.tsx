import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatRate, summarizeLines } from '@shared/tax'
import { Panel } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Display'
import { InlineAlert } from '@/components/ui/Feedback'
import { Field, Input, Segmented, Switch } from '@/components/ui/Form'
import { ConfirmDialog, Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/hooks/useToast'
import { errorMessage } from '@/lib/errors'
import { deleteTax, saveTax, type Menu } from '@/services/menu'
import type { Tax } from '@/types/domain'

/** "8.25" → 825 basis points. At most two decimals; 0–100%. */
export function parseRate(input: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(input.trim())
  if (!m) return null
  const bps = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return bps >= 0 && bps <= 10000 ? bps : null
}

export function TaxPanel({ menu, restaurantId, currency }: { menu: Menu; restaurantId: string; currency: string }) {
  const [editing, setEditing] = useState<Tax | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Tax | null>(null)
  const queryClient = useQueryClient()
  const toast = useToast()
  const remove = useMutation({
    mutationFn: (id: string) => deleteTax(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['menu', restaurantId] })
      setDeleting(null)
      toast.success('Tax removed', 'Orders already placed keep the tax they were charged.')
    },
    onError: (err) => toast.error('Couldn’t remove the tax', errorMessage(err)),
  })

  // A worked example so managers can see what guests will be charged.
  const exampleItem = 1000 * (currency === 'BIF' || currency === 'JPY' || currency === 'UGX' || currency === 'RWF' ? 10 : 1)
  const example = summarizeLines([{
    line_total_minor: exampleItem,
    quantity: 1,
    taxes: menu.taxes.filter((t) => t.is_active && t.scope === 'all').map((t) => ({ tax_id: t.id, name: t.name, rate_bps: t.rate_bps, is_inclusive: t.is_inclusive })),
  }])

  const scopeLabel = (t: Tax) => {
    if (t.scope === 'all') return 'Everything'
    if (t.scope === 'categories') {
      const names = menu.taxCategories.filter((l) => l.tax_id === t.id).map((l) => menu.categories.find((c) => c.id === l.category_id)?.name).filter(Boolean)
      return names.length ? names.join(', ') : 'No categories chosen'
    }
    const names = menu.taxItems.filter((l) => l.tax_id === t.id).map((l) => menu.items.find((i) => i.id === l.item_id)?.name).filter(Boolean)
    return names.length ? names.join(', ') : 'No items chosen'
  }

  return (
    <Panel
      title="Taxes"
      description="Calculated on every order by the server and shown to guests before they order."
      actions={<Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add tax</Button>}
    >
      {menu.taxes.length === 0 ? (
        <p className="text-sm text-ink-2">No taxes configured — guests pay menu prices as listed.</p>
      ) : (
        <ul className="divide-y divide-line">
          {menu.taxes.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {t.name} <span className="tnum">{formatRate(t.rate_bps)}</span>
                  {!t.is_active && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-ink-3">Off</span>}
                </p>
                <p className="text-sm text-ink-2">{t.is_inclusive ? 'Included in prices' : 'Added on top'}, applies to {scopeLabel(t).toLowerCase() === 'everything' ? 'everything' : scopeLabel(t)}</p>
              </div>
              <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(t)}>Edit</Button>
              <Button size="sm" variant="quiet" aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)}><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      {example.taxes.length > 0 && (
        <p className="mt-4 rounded-md bg-surface-2 px-3.5 py-2.5 text-sm text-ink-2">
          Example: an item priced <Money minor={exampleItem} currency={currency} className="font-semibold text-ink" /> costs the guest{' '}
          <Money minor={example.total_minor} currency={currency} className="font-semibold text-ink" /> including{' '}
          <Money minor={example.inclusive_tax_minor + example.exclusive_tax_minor} currency={currency} /> tax.
        </p>
      )}

      <TaxEditor open={editing !== null} tax={editing === 'new' ? null : editing} menu={menu} restaurantId={restaurantId} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={`Delete ${deleting?.name}?`}
        body={<p>New orders won’t include it. Orders already placed keep the tax they were charged. To pause it, switch it off instead.</p>}
        confirmLabel="Delete tax"
      />
    </Panel>
  )
}

function TaxEditor({ open, tax, menu, restaurantId, onClose }: { open: boolean; tax: Tax | null; menu: Menu; restaurantId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [rate, setRate] = useState('')
  const [inclusive, setInclusive] = useState(false)
  const [scope, setScope] = useState<'all' | 'categories' | 'items'>('all')
  const [active, setActive] = useState(true)
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [itemIds, setItemIds] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setName(tax?.name ?? '')
    setRate(tax ? (tax.rate_bps / 100).toString() : '')
    setInclusive(tax?.is_inclusive ?? false)
    setScope(tax?.scope ?? 'all')
    setActive(tax?.is_active ?? true)
    setCategoryIds(tax ? menu.taxCategories.filter((l) => l.tax_id === tax.id).map((l) => l.category_id) : [])
    setItemIds(tax ? menu.taxItems.filter((l) => l.tax_id === tax.id).map((l) => l.item_id) : [])
  }, [open, tax, menu])

  const bps = parseRate(rate)
  const save = useMutation({
    mutationFn: () => saveTax(restaurantId, { id: tax?.id, name: name.trim(), rate_bps: bps!, is_inclusive: inclusive, scope, is_active: active, categoryIds, itemIds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['menu', restaurantId] })
      toast.success('Tax saved', 'It applies to new orders from now on.')
      onClose()
    },
    onError: (err) => toast.error('Couldn’t save the tax', errorMessage(err)),
  })

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tax ? `Edit ${tax.name}` : 'New tax'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={!name.trim() || bps === null} onClick={() => save.mutate()}>Save tax</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Field label="Name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="VAT" data-autofocus />}</Field>
          <Field label="Rate (%)" error={rate && bps === null ? 'Up to 2 decimals' : null}>
            {(p) => <Input {...p} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="16" className="tnum" />}
          </Field>
        </div>
        <Switch
          checked={inclusive}
          onChange={setInclusive}
          label="Already included in menu prices"
          description={inclusive ? 'Guests pay the menu price; the tax portion is shown on the bill.' : 'Added on top of menu prices at checkout.'}
        />
        <div>
          <p className="mb-2 text-sm font-semibold">Applies to</p>
          <Segmented label="Applies to" value={scope} onChange={setScope} options={[{ value: 'all', label: 'Everything' }, { value: 'categories', label: 'Categories' }, { value: 'items', label: 'Items' }]} />
        </div>
        {scope === 'categories' && (
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="sr-only">Categories</legend>
            {menu.categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
                <input type="checkbox" checked={categoryIds.includes(c.id)} onChange={() => toggle(categoryIds, setCategoryIds, c.id)} />
                {c.name}
              </label>
            ))}
          </fieldset>
        )}
        {scope === 'items' && (
          <fieldset className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
            <legend className="sr-only">Items</legend>
            {menu.items.map((i) => (
              <label key={i.id} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
                <input type="checkbox" checked={itemIds.includes(i.id)} onChange={() => toggle(itemIds, setItemIds, i.id)} />
                {i.name}
              </label>
            ))}
          </fieldset>
        )}
        {scope !== 'all' && (scope === 'categories' ? categoryIds : itemIds).length === 0 && (
          <InlineAlert tone="warning">Choose at least one {scope === 'categories' ? 'category' : 'item'}, or this tax won’t apply to anything.</InlineAlert>
        )}
        <Switch checked={active} onChange={setActive} label="Active" description="Switch off to stop charging it without deleting it." />
      </div>
    </Sheet>
  )
}
