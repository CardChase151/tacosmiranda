import { supabase } from '../config/supabase'

export type DeleteResult =
  | { kind: 'deleted' }
  | { kind: 'archived'; orderCount: number }
  | { kind: 'error'; message: string }

// Hard-deletes a menu item if no past order references it. Otherwise flips
// is_86=true so receipts/reporting stay intact (order_items.menu_item_id is
// ON DELETE NO ACTION). menu_item_modifier_groups + menu_item_ingredients
// cascade automatically.
export async function deleteOrArchiveMenuItem(menuItemId: string): Promise<DeleteResult> {
  const { count, error: countError } = await supabase
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('menu_item_id', menuItemId)

  if (countError) return { kind: 'error', message: countError.message }

  const orderCount = count ?? 0

  if (orderCount > 0) {
    const { error } = await supabase.from('menu_items').update({ is_86: true }).eq('id', menuItemId)
    if (error) return { kind: 'error', message: error.message }
    return { kind: 'archived', orderCount }
  }

  const { error } = await supabase.from('menu_items').delete().eq('id', menuItemId)
  if (error) return { kind: 'error', message: error.message }
  return { kind: 'deleted' }
}
