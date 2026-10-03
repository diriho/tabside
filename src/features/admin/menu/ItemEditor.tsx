import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { InlineAlert } from '@/components/ui/Feedback'
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/Form'
import { ImageField } from '@/components/ui/ImageField'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { ConfirmDialog, Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { archiveItem, replaceModifierGroups, replaceVariants, saveItem, type FullMenuItem, type Menu, type ModifierGroupDraft } from '@/services/menu'
import type { ItemAvailability } from '@/types/domain'

const TAG_OPTIONS = ['popular', 'vegetarian', 'vegan', 'spicy', 'alcohol']

interface VariantDraft { id?: string; name: string; price_minor: number | null; is_available: boolean }
interface GroupDraft extends Omit<ModifierGroupDraft, 'modifiers'> {
  modifiers: Array<{ id?: string; name: string; price_delta_minor: number | null; is_available: boolean }>
}

export function ItemEditor({
  open,
  item,
  defaultCategoryId,
  menu,
  restaurantId,
  currency,
  onClose,
}: {
  open: boolean
  item: FullMenuItem | null
  defaultCategoryId: string | null
  menu: Menu
  restaurantId: string
  currency: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [availability, setAvailability] = useState<ItemAvailability>('available')
  const [tags, setTags] = useState<string[]>([])
  const [variants, setVariants] = useState<VariantDraft[]>([])
  const [groups, setGroups] = useState<GroupDraft[]>([])
  const [confirmArchive, setConfirmArchive] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(item?.name ?? '')
    setDescription(item?.description ?? '')
    setCategoryId(item ? item.category_id : defaultCategoryId)
    setPrice(item?.price_minor ?? null)
    setImageUrl(item?.image_url ?? null)
    setAvailability(item?.availability ?? 'available')
    setTags(item?.tags ?? [])
    setVariants(item?.menu_item_variants.map((v) => ({ id: v.id, name: v.name, price_minor: v.price_minor, is_available: v.is_available })) ?? [])
    setGroups(
      item?.menu_modifier_groups.map((g) => ({
        id: g.id, name: g.name, min_select: g.min_select, max_select: g.max_select,
        modifiers: g.menu_modifiers.map((m) => ({ id: m.id, name: m.name, price_delta_minor: m.price_delta_minor, is_available: m.is_available })),
      })) ?? [],
    )
  }, [open, item, defaultCategoryId])

  const hasVariants = variants.length > 0
  const problems: string[] = []
  if (!name.trim()) problems.push('Give the item a name.')
  if (!hasVariants && price === null) problems.push('Enter a valid price.')
  if (variants.some((v) => !v.name.trim() || v.price_minor === null)) problems.push('Every size or option needs a name and price.')
  if (groups.some((g) => !g.name.trim() || g.modifiers.length === 0 || g.modifiers.some((m) => !m.name.trim() || m.price_delta_minor === null))) {
    problems.push('Every choice group needs a name and at least one option with a price (0 is fine).')
  }
  if (groups.some((g) => g.max_select < Math.max(1, g.min_select) || g.max_select > Math.max(1, g.modifiers.length))) {
    problems.push('Check the “at most” number for each choice group.')
  }

  const save = useMutation({
    mutationFn: async () => {
      const basePrice = hasVariants ? Math.min(...variants.map((v) => v.price_minor ?? 0)) : price!
      const saved = await saveItem({
        id: item?.id,
        restaurant_id: restaurantId,
        category_id: categoryId,
        name: name.trim(),
        description: description.trim() || null,
        image_url: imageUrl,
        price_minor: basePrice,
        availability,
        tags,
        sort_order: item?.sort_order ?? menu.items.filter((i) => i.category_id === categoryId).length + 1,
      })
      await replaceVariants(restaurantId, saved.id, variants.map((v) => ({ id: v.id, name: v.name.trim(), price_minor: v.price_minor!, is_available: v.is_available })))
      await replaceModifierGroups(
        restaurantId,
        saved.id,
        groups.map((g) => ({ ...g, name: g.name.trim(), modifiers: g.modifiers.map((m) => ({ ...m, name: m.name.trim(), price_delta_minor: m.price_delta_minor! })) })),
      )
      return saved
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['menu', restaurantId] })
      toast.success(item ? `${saved.name} updated` : `${saved.name} added to the menu`)
      onClose()
    },
    onError: (err) => toast.error('Couldn’t save the item', errorMessage(err)),
  })

  const archive = useMutation({
    mutationFn: () => archiveItem(item!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['menu', restaurantId] })
      toast.success(`${item?.name} removed from the menu`, 'Past orders keep their record of it.')
      setConfirmArchive(false)
      onClose()
    },
    onError: (err) => toast.error('Couldn’t remove the item', errorMessage(err)),
  })

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      title={item ? `Edit ${item.name}` : 'New menu item'}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {item && (
            <Button variant="quiet" icon={<Archive className="size-4" />} onClick={() => setConfirmArchive(true)}>Delete item</Button>
          )}
          <div className="flex-1" />
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={problems.length > 0} onClick={() => save.mutate()}>{item ? 'Save item' : 'Add item'}</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} data-autofocus />}</Field>
          <Field label="Category">
            {(p) => (
              <Select {...p} value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value || null)}>
                <option value="">No category</option>
                {menu.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Description" optional className="sm:col-span-2">
            {(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} className="min-h-20" />}
          </Field>
          {!hasVariants && (
            <Field label="Price" hint={`In ${currency}.`}>{(p) => <MoneyInput {...p} value={price} onChange={setPrice} currency={currency} />}</Field>
          )}
          <Field label="Availability">
            {(p) => (
              <Select {...p} value={availability} onChange={(e) => setAvailability(e.target.value as ItemAvailability)}>
                <option value="available">Available</option>
                <option value="sold_out">Sold out (shown, can’t be ordered)</option>
                <option value="hidden">Hidden from guests</option>
              </Select>
            )}
          </Field>
        </div>

        <div>
          <p className="text-sm font-semibold">Labels</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {TAG_OPTIONS.map((t) => {
              const on = tags.includes(t)
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
                  className={cn('h-9 rounded-full border px-3.5 text-sm font-semibold capitalize transition-colors', on ? 'border-clay bg-clay-soft text-clay' : 'border-line-strong text-ink-2 hover:text-ink')}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </div>

        <ImageField label="Photo" value={imageUrl} onChange={setImageUrl} restaurantId={restaurantId} folder="items" aspect="aspect-square" />

        <section className="rounded-lg border border-line p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold">Sizes or options</h3>
              <p className="text-sm text-ink-2">e.g. Glass / Bottle. Guests must pick one, and it sets the price.</p>
            </div>
            <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setVariants([...variants, { name: '', price_minor: price, is_available: true }])}>Add</Button>
          </div>
          {variants.length > 0 && (
            <ul className="mt-3 space-y-2">
              {variants.map((v, i) => (
                <li key={v.id ?? `new-${i}`} className="flex flex-wrap items-center gap-2">
                  <Input aria-label="Option name" placeholder="Name" value={v.name} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="min-w-32 flex-1" />
                  <MoneyInput aria-label="Option price" value={v.price_minor} currency={currency} onChange={(m) => setVariants(variants.map((x, j) => (j === i ? { ...x, price_minor: m } : x)))} className="w-32" />
                  <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={v.is_available} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, is_available: e.target.checked } : x)))} /> Available</label>
                  <button type="button" aria-label="Remove option" className="rounded-full p-2 text-ink-3 hover:bg-surface-2" onClick={() => setVariants(variants.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-line p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold">Choices & extras</h3>
              <p className="text-sm text-ink-2">e.g. “Cook” (pick 1) or “Add-ons” (up to 3, extra cost).</p>
            </div>
            <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setGroups([...groups, { name: '', min_select: 0, max_select: 1, modifiers: [{ name: '', price_delta_minor: 0, is_available: true }] }])}>Add group</Button>
          </div>
          <div className="mt-3 space-y-4">
            {groups.map((g, gi) => {
              const update = (patch: Partial<GroupDraft>) => setGroups(groups.map((x, j) => (j === gi ? { ...x, ...patch } : x)))
              return (
                <div key={g.id ?? `g-${gi}`} className="rounded-md bg-surface-2 p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label="Group name" className="min-w-40 flex-1">{(p) => <Input {...p} value={g.name} onChange={(e) => update({ name: e.target.value })} />}</Field>
                    <Field label="Required" className="w-28">
                      {(p) => (
                        <Select {...p} value={g.min_select > 0 ? 'yes' : 'no'} onChange={(e) => update({ min_select: e.target.value === 'yes' ? 1 : 0 })}>
                          <option value="no">Optional</option>
                          <option value="yes">Required</option>
                        </Select>
                      )}
                    </Field>
                    <Field label="At most" className="w-24">
                      {(p) => <Input {...p} type="number" min={1} max={20} value={g.max_select} onChange={(e) => update({ max_select: Math.max(1, Number(e.target.value) || 1) })} />}
                    </Field>
                    <button type="button" aria-label="Remove group" className="mb-1 rounded-full p-2 text-ink-3 hover:bg-surface" onClick={() => setGroups(groups.filter((_, j) => j !== gi))}><Trash2 className="size-4" /></button>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {g.modifiers.map((m, mi) => (
                      <li key={m.id ?? `m-${mi}`} className="flex flex-wrap items-center gap-2">
                        <Input aria-label="Choice name" placeholder="Choice" value={m.name} onChange={(e) => update({ modifiers: g.modifiers.map((x, j) => (j === mi ? { ...x, name: e.target.value } : x)) })} className="min-w-32 flex-1" />
                        <MoneyInput aria-label="Extra cost" value={m.price_delta_minor} currency={currency} onChange={(v) => update({ modifiers: g.modifiers.map((x, j) => (j === mi ? { ...x, price_delta_minor: v } : x)) })} className="w-32" />
                        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={m.is_available} onChange={(e) => update({ modifiers: g.modifiers.map((x, j) => (j === mi ? { ...x, is_available: e.target.checked } : x)) })} /> Available</label>
                        <button type="button" aria-label="Remove choice" className="rounded-full p-2 text-ink-3 hover:bg-surface" onClick={() => update({ modifiers: g.modifiers.filter((_, j) => j !== mi) })}><Trash2 className="size-4" /></button>
                      </li>
                    ))}
                  </ul>
                  <Button size="sm" variant="quiet" className="mt-2" icon={<Plus className="size-4" />} onClick={() => update({ modifiers: [...g.modifiers, { name: '', price_delta_minor: 0, is_available: true }] })}>Add choice</Button>
                </div>
              )
            })}
          </div>
        </section>

        {problems.length > 0 && (name || price !== null || variants.length > 0) && (
          <InlineAlert tone="warning"><ul className="list-disc pl-4">{problems.map((p) => <li key={p}>{p}</li>)}</ul></InlineAlert>
        )}
      </div>

      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={() => archive.mutate()}
        loading={archive.isPending}
        title={`Delete ${item?.name ?? 'this item'}?`}
        body={<p>It disappears from the menu. Orders that already include it keep their record. To pause it temporarily, mark it sold out or hidden instead.</p>}
        confirmLabel="Delete item"
      />
    </Sheet>
  )
}

export function AvailabilityToggle({ value, onChange, disabled }: { value: ItemAvailability; onChange: (v: ItemAvailability) => void; disabled?: boolean }) {
  return (
    <Select aria-label="Availability" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as ItemAvailability)} className={cn('h-9 w-36 text-sm', value === 'sold_out' && 'text-danger', value === 'hidden' && 'text-ink-3')}>
      <option value="available">Available</option>
      <option value="sold_out">Sold out</option>
      <option value="hidden">Hidden</option>
    </Select>
  )
}

export function CategoryEditor({
  open,
  category,
  restaurantId,
  nextSort,
  onClose,
  onSave,
  saving,
}: {
  open: boolean
  category: { id: string; name: string; description: string | null; is_active: boolean } | null
  restaurantId: string
  nextSort: number
  onClose: () => void
  onSave: (v: { id?: string; restaurant_id: string; name: string; description: string | null; is_active: boolean; sort_order?: number }) => void
  saving: boolean
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(true)
  useEffect(() => {
    if (!open) return
    setName(category?.name ?? '')
    setDescription(category?.description ?? '')
    setActive(category?.is_active ?? true)
  }, [open, category])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="sm"
      title={category ? `Edit ${category.name}` : 'New category'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={saving}
            disabled={!name.trim()}
            onClick={() => onSave({ id: category?.id, restaurant_id: restaurantId, name: name.trim(), description: description.trim() || null, is_active: active, ...(category ? {} : { sort_order: nextSort }) })}
          >
            Save category
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Starters" data-autofocus />}</Field>
        <Field label="Short description" optional>{(p) => <Input {...p} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />}</Field>
        <Switch checked={active} onChange={setActive} label="Show on the menu" description="Hidden categories hide all their items from guests." />
      </div>
    </Sheet>
  )
}
