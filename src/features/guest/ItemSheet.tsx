import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatMoney } from '@shared/currency'
import { Button } from '@/components/ui/Button'
import { Photo } from '@/components/ui/Display'
import { Stepper, Textarea } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Sheet'
import { cn } from '@/lib/cn'
import type { FullMenuItem } from '@/services/menu'

export function ItemSheet({
  item,
  currency,
  onClose,
  onAdd,
}: {
  item: FullMenuItem | null
  currency: string
  onClose: () => void
  onAdd: (line: { itemId: string; variantId: string | null; modifierIds: string[]; quantity: number; notes: string }) => void
}) {
  const [variantId, setVariantId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    if (!item) return
    const firstVariant = item.menu_item_variants.find((v) => v.is_available)
    setVariantId(firstVariant?.id ?? null)
    setSelected({})
    setQuantity(1)
    setNotes('')
    setShowErrors(false)
  }, [item])

  if (!item) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>

  const variant = item.menu_item_variants.find((v) => v.id === variantId) ?? null
  const modifierIds = Object.values(selected).flat()
  const modifiers = item.menu_modifier_groups.flatMap((g) => g.menu_modifiers).filter((m) => modifierIds.includes(m.id))
  const unit = (variant ? variant.price_minor : item.price_minor) + modifiers.reduce((s, m) => s + m.price_delta_minor, 0)
  const invalidGroups = item.menu_modifier_groups.filter((g) => {
    const n = selected[g.id]?.length ?? 0
    return n < g.min_select || n > g.max_select
  })
  const missingVariant = item.menu_item_variants.length > 0 && !variant

  const toggle = (groupId: string, modifierId: string, max: number) => {
    setSelected((prev) => {
      const current = prev[groupId] ?? []
      if (current.includes(modifierId)) return { ...prev, [groupId]: current.filter((id) => id !== modifierId) }
      if (max === 1) return { ...prev, [groupId]: [modifierId] }
      if (current.length >= max) return prev
      return { ...prev, [groupId]: [...current, modifierId] }
    })
  }

  const submit = () => {
    if (invalidGroups.length || missingVariant) {
      setShowErrors(true)
      return
    }
    onAdd({ itemId: item.id, variantId, modifierIds, quantity, notes: notes.trim() })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      hideTitle={Boolean(item.image_url)}
      footer={
        <div className="flex items-center gap-4">
          <Stepper label="quantity" value={quantity} min={1} max={99} onChange={setQuantity} />
          <Button size="lg" block onClick={submit} className="justify-between px-5">
            <span>Add to order</span>
            <span className="tnum">{formatMoney(unit * quantity, currency)}</span>
          </Button>
        </div>
      }
    >
      {item.image_url && <Photo src={item.image_url} alt="" className="-mx-5 -mt-2 mb-4 aspect-[16/10] sm:-mx-6 sm:rounded-none" />}
      {item.image_url && <h2 className="display text-[26px] font-extrabold">{item.name}</h2>}
      {item.description && <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{item.description}</p>}

      {item.menu_item_variants.length > 0 && (
        <fieldset className="mt-6">
          <legend className="flex w-full items-baseline justify-between">
            <span className="text-[17px] font-bold">Choose one</span>
            <span className={cn('text-[13px] font-semibold', showErrors && missingVariant ? 'text-danger' : 'text-ink-3')}>Required</span>
          </legend>
          <div className="mt-2 divide-y divide-line rounded-lg border border-line">
            {item.menu_item_variants.map((v) => (
              <ChoiceRow
                key={v.id}
                type="radio"
                name="variant"
                checked={variantId === v.id}
                disabled={!v.is_available}
                onChange={() => setVariantId(v.id)}
                label={v.name}
                price={v.is_available ? formatMoney(v.price_minor, currency) : 'Sold out'}
              />
            ))}
          </div>
        </fieldset>
      )}

      {item.menu_modifier_groups.map((group) => {
        const count = selected[group.id]?.length ?? 0
        const invalid = showErrors && invalidGroups.includes(group)
        const rule =
          group.min_select > 0 && group.min_select === group.max_select
            ? group.min_select === 1 ? 'Required' : `Choose ${group.min_select}`
            : group.min_select > 0
              ? `Choose ${group.min_select}–${group.max_select}`
              : group.max_select === 1 ? 'Optional' : `Up to ${group.max_select}`
        return (
          <fieldset key={group.id} className="mt-6">
            <legend className="flex w-full items-baseline justify-between">
              <span className="text-[17px] font-bold">{group.name}</span>
              <span className={cn('text-[13px] font-semibold', invalid ? 'text-danger' : 'text-ink-3')}>{rule}</span>
            </legend>
            <div className="mt-2 divide-y divide-line rounded-lg border border-line">
              {group.menu_modifiers.map((m) => {
                const checked = selected[group.id]?.includes(m.id) ?? false
                return (
                  <ChoiceRow
                    key={m.id}
                    type={group.max_select === 1 ? 'radio' : 'checkbox'}
                    name={group.id}
                    checked={checked}
                    disabled={!m.is_available || (!checked && group.max_select > 1 && count >= group.max_select)}
                    onChange={() => toggle(group.id, m.id, group.max_select)}
                    label={m.name}
                    price={!m.is_available ? 'Sold out' : m.price_delta_minor > 0 ? `+${formatMoney(m.price_delta_minor, currency)}` : ''}
                  />
                )
              })}
            </div>
          </fieldset>
        )
      })}

      <div className="mt-6">
        <label htmlFor="item-notes" className="text-[17px] font-bold">Anything we should know?</label>
        <Textarea
          id="item-notes"
          className="mt-2 min-h-20"
          maxLength={200}
          placeholder="Allergies, no onions, sauce on the side…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Sheet>
  )
}

function ChoiceRow({
  type,
  name,
  checked,
  disabled,
  onChange,
  label,
  price,
}: {
  type: 'radio' | 'checkbox'
  name: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
  label: string
  price: string
}) {
  return (
    <label className={cn('flex min-h-13 items-center gap-3 px-4 py-2', disabled ? 'opacity-45' : 'cursor-pointer')}>
      <input type={type} name={name} checked={checked} disabled={disabled} onChange={onChange} className="peer sr-only" />
      <span
        aria-hidden
        className={cn(
          'flex size-6 shrink-0 items-center justify-center border-2 transition-colors peer-focus-visible:ring-3 peer-focus-visible:ring-clay/30',
          type === 'radio' ? 'rounded-full' : 'rounded-md',
          checked ? 'border-clay bg-clay text-on-clay' : 'border-line-strong bg-surface',
        )}
      >
        {checked && (type === 'radio' ? <span className="size-2.5 rounded-full bg-on-clay" /> : <Check className="size-4" strokeWidth={3} />)}
      </span>
      <span className="flex-1 text-[15.5px] font-medium">{label}</span>
      <span className="tnum text-[14.5px] text-ink-2">{price}</span>
    </label>
  )
}
