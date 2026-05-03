export interface MenuCategory {
  id: string
  name: string
  sort_order: number
  meal_type: 'breakfast' | 'lunch_dinner'
}

export interface MenuItem {
  id: string
  category_id: string
  name: string
  price: number
  description: string
  sort_order: number
  is_test?: boolean
  is_86?: boolean
}

export interface EmailSubscriber {
  first_name: string
  last_name: string
  email: string
}

export interface Profile {
  id: string
  email: string
  is_admin: boolean
}

export interface ModifierGroup {
  id: string
  name: string
  display_name: string
  sort_order: number
}

export interface Modifier {
  id: string
  modifier_group_id: string
  name: string
  upcharge: number
  sort_order: number
  is_86?: boolean
}

export interface MenuItemModifierGroup {
  id: string
  menu_item_id: string
  modifier_group_id: string
  is_required: boolean
  min_selections: number
  max_selections: number
  sort_order: number
  modifier_group?: ModifierGroup
}

export interface CartItemModifier {
  modifier_id: string
  modifier_name: string
  upcharge: number
}

export interface Ingredient {
  id: string
  name: string
  category: string
  category_id?: string | null
  sort_order: number
  is_86?: boolean
}

export interface IngredientCategory {
  id: string
  name: string
  sort_order: number
  is_86?: boolean
}

export interface MenuItemIngredient {
  id: string
  menu_item_id: string
  ingredient_id: string
  is_default: boolean
  is_removable: boolean
  can_add_extra: boolean
  extra_charge: number
  sort_order: number
  ingredient?: Ingredient
}

export interface CartItemIngredient {
  ingredient_id: string
  ingredient_name: string
  action: 'remove' | 'extra'
  extra_charge: number
}

export interface CartItem {
  cart_id: string
  menu_item_id: string
  item_name: string
  unit_price: number
  quantity: number
  modifiers: CartItemModifier[]
  ingredients: CartItemIngredient[]
  special_instructions: string
  line_total: number
}

export interface Order {
  id: string
  order_number: string
  customer_email: string
  customer_name: string
  status: string
  subtotal: number
  tax: number
  total: number
  special_instructions: string
  created_at: string
}
