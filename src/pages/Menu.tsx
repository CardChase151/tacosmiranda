import { useState, useEffect, useCallback } from 'react'
import { FileDown } from 'lucide-react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { MenuCategory, MenuItem } from '../types'
import MenuSection from '../components/MenuSection'
import { generateMenuPdf } from '../utils/menuPdf'

export default function Menu() {
  const { isAdmin } = useAuth()
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMenu = useCallback(async () => {
    const [catRes, itemRes] = await Promise.all([
      supabase.from('menu_categories').select('*').order('sort_order'),
      supabase.from('menu_items').select('*').order('sort_order'),
    ])
    if (catRes.data) setCategories(catRes.data)
    if (itemRes.data) setItems(itemRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchMenu() }, [fetchMenu])

  const handleDownloadPdf = () => {
    generateMenuPdf(categories, items)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--gray)', fontSize: 14 }}>Loading menu...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '40px 24px 100px', maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{
        fontFamily: 'var(--font-heading)',
        fontSize: 40,
        color: 'var(--white)',
        textAlign: 'center',
        letterSpacing: 4,
        marginBottom: 8,
      }}>
        Our Menu
      </h1>
      <p style={{
        textAlign: 'center',
        color: 'var(--gray)',
        fontSize: 14,
        fontStyle: 'italic',
        marginBottom: 48,
      }}>
        White corn tortillas &middot; Cooked in beef tallow
      </p>

      {categories.map(cat => (
        <MenuSection
          key={cat.id}
          category={cat}
          items={items.filter(i => i.category_id === cat.id)}
          isAdmin={isAdmin}
          onUpdate={fetchMenu}
        />
      ))}

      {/* PDF Download FAB */}
      <button
        onClick={handleDownloadPdf}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'var(--gold)',
          color: 'var(--black)',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(200,168,78,0.3)',
          transition: 'transform 0.2s, box-shadow 0.2s',
          zIndex: 50,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.1)'
          e.currentTarget.style.boxShadow = '0 6px 24px rgba(200,168,78,0.5)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(200,168,78,0.3)'
        }}
        title="Download PDF Menu"
      >
        <FileDown size={22} />
      </button>
    </div>
  )
}
