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
