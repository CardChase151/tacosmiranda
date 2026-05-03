import { supabase } from '../config/supabase'

export type SafeDeleteResult =
  | { kind: 'deleted' }
  | { kind: 'archived'; refCount: number }
  | { kind: 'error'; message: string }

interface SafeDeleteParams {
  table: string
  id: string
  refTable: string
  refColumn: string
  archiveColumn?: string
}

// Generic version of menuItemDelete: counts past references in `refTable` first.
// If any → flips `archiveColumn` (default: is_86) to true. Else hard-deletes.
// Mirrors the pattern in src/utils/menuItemDelete.ts so all "soft delete when
// referenced" tables behave the same way (menu_items, ingredients, modifiers,
// ingredient_categories, etc).
export async function safeDeleteOrArchive(p: SafeDeleteParams): Promise<SafeDeleteResult> {
  const archiveColumn = p.archiveColumn ?? 'is_86'

  const { count, error: countError } = await supabase
    .from(p.refTable)
    .select('id', { count: 'exact', head: true })
    .eq(p.refColumn, p.id)

  if (countError) return { kind: 'error', message: countError.message }

  const refCount = count ?? 0

  if (refCount > 0) {
    const { error } = await supabase.from(p.table).update({ [archiveColumn]: true }).eq('id', p.id)
    if (error) return { kind: 'error', message: error.message }
    return { kind: 'archived', refCount }
  }

  const { error } = await supabase.from(p.table).delete().eq('id', p.id)
  if (error) return { kind: 'error', message: error.message }
  return { kind: 'deleted' }
}
