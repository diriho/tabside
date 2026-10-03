import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, EyeOff, Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react'
import { useState } from 'react'
import { PageHeader, Panel } from '@/components/layout/Page'
import { itemPriceLabel } from '@/components/menu/MenuSections'
import { Button } from '@/components/ui/Button'
import { Photo } from '@/components/ui/Display'
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Sheet'
import { useStaffContext } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { deleteCategory, getMenu, reorder, saveCategory, setAvailability, type FullMenuItem } from '@/services/menu'
import type { MenuCategory } from '@/types/domain'
import { AvailabilityToggle, CategoryEditor, ItemEditor } from './menu/ItemEditor'
import { TaxPanel } from './menu/TaxPanel'

export default function MenuManagerPage() {
  const staff = useStaffContext()
  const restaurantId = staff.restaurant.id
  const currency = staff.restaurant.currency
  const queryClient = useQueryClient()
  const toast = useToast()
  const menu = useQuery({ queryKey: ['menu', restaurantId], queryFn: () => getMenu(restaurantId) })
  const [itemEditor, setItemEditor] = useState<{ item: FullMenuItem | null; categoryId: string | null } | null>(null)
  const [categoryEditor, setCategoryEditor] = useState<MenuCategory | 'new' | null>(null)
  const [deletingCategory, setDeletingCategory] = useState<MenuCategory | null>(null)

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['menu', restaurantId] })
  const saveCat = useMutation({
    mutationFn: saveCategory,
    onSuccess: () => {
      invalidate()
      setCategoryEditor(null)
      toast.success('Category saved')
    },
    onError: (err) => toast.error('Couldn’t save the category', errorMessage(err)),
  })
  const removeCat = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      invalidate()
      setDeletingCategory(null)
      toast.success('Category deleted')
    },
    onError: (err) => toast.error('Couldn’t delete the category', errorMessage(err)),
  })
  const availability = useMutation({
    mutationFn: (v: { id: string; availability: 'available' | 'sold_out' | 'hidden' }) => setAvailability(v.id, v.availability),
    onSuccess: invalidate,
    onError: (err) => toast.error('Couldn’t update availability', errorMessage(err)),
  })
  const move = useMutation({
    mutationFn: (v: { table: 'menu_categories' | 'menu_items'; ids: string[] }) => reorder(v.table, v.ids),
    onSuccess: invalidate,
  })

  if (menu.isPending) return <PageLoader />
  if (menu.isError) return <ErrorState error={menu.error} onRetry={() => void menu.refetch()} />
  const m = menu.data
  const uncategorized = m.items.filter((i) => !i.category_id)

  const swap = <T extends { id: string }>(list: T[], index: number, dir: -1 | 1) => {
    const next = [...list]
    const target = index + dir
    if (target < 0 || target >= next.length) return null
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    return next.map((x) => x.id)
  }

  const renderItems = (items: FullMenuItem[]) =>
    items.length === 0 ? (
      <p className="py-3 text-sm text-ink-3">No items in this category yet.</p>
    ) : (
      <ul className="divide-y divide-line">
        {items.map((item, idx) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
            <Photo src={item.image_url} alt="" className="size-12 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <p className={cn('font-semibold', item.availability === 'hidden' && 'text-ink-3')}>
                {item.name}
                {item.availability === 'hidden' && <EyeOff className="ml-1.5 inline size-4" aria-label="Hidden" />}
              </p>
              <p className="tnum text-sm text-ink-2">
                {itemPriceLabel(item, currency)}
                {item.menu_item_variants.length > 0 && `, ${item.menu_item_variants.length} sizes`}
                {item.menu_modifier_groups.length > 0 && `, ${item.menu_modifier_groups.length} choice ${item.menu_modifier_groups.length === 1 ? 'group' : 'groups'}`}
              </p>
            </div>
            <AvailabilityToggle value={item.availability} onChange={(v) => availability.mutate({ id: item.id, availability: v })} />
            <div className="flex">
              <Button variant="quiet" size="sm" aria-label={`Move ${item.name} up`} disabled={idx === 0} onClick={() => { const ids = swap(items, idx, -1); if (ids) move.mutate({ table: 'menu_items', ids }) }}><ArrowUp className="size-4" /></Button>
              <Button variant="quiet" size="sm" aria-label={`Move ${item.name} down`} disabled={idx === items.length - 1} onClick={() => { const ids = swap(items, idx, 1); if (ids) move.mutate({ table: 'menu_items', ids }) }}><ArrowDown className="size-4" /></Button>
              <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={() => setItemEditor({ item, categoryId: item.category_id })}>Edit</Button>
            </div>
          </li>
        ))}
      </ul>
    )

  return (
    <div>
      <PageHeader
        title="Menu & taxes"
        description="Changes reach guests’ phones instantly. Prices are only editable by managers."
        actions={
          <>
            <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setCategoryEditor('new')}>Category</Button>
            <Button icon={<Plus className="size-4" />} onClick={() => setItemEditor({ item: null, categoryId: m.categories[0]?.id ?? null })}>Menu item</Button>
          </>
        }
      />

      <div className="space-y-6">
        {m.categories.length === 0 && m.items.length === 0 ? (
          <Panel>
            <EmptyState
              icon={<UtensilsCrossed />}
              title="Start your menu"
              body="Create a few categories (like Food, Drinks, Desserts), then add items with prices."
              action={<Button onClick={() => setCategoryEditor('new')}>Add a category</Button>}
            />
          </Panel>
        ) : (
          m.categories.map((c, idx) => {
            const items = m.items.filter((i) => i.category_id === c.id)
            return (
              <Panel
                key={c.id}
                title={c.name}
                description={!c.is_active ? 'Hidden from guests' : c.description ?? undefined}
                className={cn(!c.is_active && 'border-dashed')}
                actions={
                  <div className="flex flex-wrap items-center gap-1">
                    <Button variant="quiet" size="sm" aria-label={`Move ${c.name} up`} disabled={idx === 0} onClick={() => { const ids = swap(m.categories, idx, -1); if (ids) move.mutate({ table: 'menu_categories', ids }) }}><ArrowUp className="size-4" /></Button>
                    <Button variant="quiet" size="sm" aria-label={`Move ${c.name} down`} disabled={idx === m.categories.length - 1} onClick={() => { const ids = swap(m.categories, idx, 1); if (ids) move.mutate({ table: 'menu_categories', ids }) }}><ArrowDown className="size-4" /></Button>
                    <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={() => setCategoryEditor(c)}>Edit</Button>
                    <Button variant="quiet" size="sm" aria-label={`Delete ${c.name}`} onClick={() => setDeletingCategory(c)}><Trash2 className="size-4" /></Button>
                    <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => setItemEditor({ item: null, categoryId: c.id })}>Item</Button>
                  </div>
                }
              >
                {renderItems(items)}
              </Panel>
            )
          })
        )}
        {uncategorized.length > 0 && <Panel title="Not in a category" description="Shown to guests under “More”.">{renderItems(uncategorized)}</Panel>}

        <TaxPanel menu={m} restaurantId={restaurantId} currency={currency} />
      </div>

      <ItemEditor
        open={itemEditor !== null}
        item={itemEditor?.item ?? null}
        defaultCategoryId={itemEditor?.categoryId ?? null}
        menu={m}
        restaurantId={restaurantId}
        currency={currency}
        onClose={() => setItemEditor(null)}
      />
      <CategoryEditor
        open={categoryEditor !== null}
        category={categoryEditor === 'new' ? null : categoryEditor}
        restaurantId={restaurantId}
        nextSort={m.categories.length + 1}
        onClose={() => setCategoryEditor(null)}
        onSave={(v) => saveCat.mutate(v)}
        saving={saveCat.isPending}
      />
      <ConfirmDialog
        open={Boolean(deletingCategory)}
        onClose={() => setDeletingCategory(null)}
        onConfirm={() => deletingCategory && removeCat.mutate(deletingCategory.id)}
        loading={removeCat.isPending}
        title={`Delete ${deletingCategory?.name}?`}
        body={<p>Its items stay on the menu under “More” until you move them. To hide the whole section instead, edit the category and switch off “Show on the menu”.</p>}
        confirmLabel="Delete category"
      />
    </div>
  )
}
