import { supabase } from '../config/supabase'

export type DeleteResult =
  | { kind: 'deleted' }
  | { kind: 'archived'; orderCount: number }
  | { kind: 'error'; message: string }

// Deletes a menu item outright. order_items.menu_item_id is ON DELETE SET NULL
// and order_items already stores item_name, unit_price and line_total, so past
// receipts and reporting still read correctly after the item is gone.
// menu_item_modifier_groups + menu_item_ingredients cascade automatically.
//
// This used to 86 the item instead whenever it had ever been ordered, because
// the foreign key was NO ACTION and a real delete threw. Charlie hit that with
// a duplicate Quesabirria: he pressed delete, the item stayed on the menu, and
// nothing explained why.
export async function deleteOrArchiveMenuItem(menuItemId: string): Promise<DeleteResult> {
  const { error } = await supabase.from('menu_items').delete().eq('id', menuItemId)
  if (error) return { kind: 'error', message: error.message }
  return { kind: 'deleted' }
}
