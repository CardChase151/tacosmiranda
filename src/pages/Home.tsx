import { useState, useEffect, useCallback } from 'react'
import { Wheat, Flame, FileDown, MapPin, Clock, Phone, ShoppingBag } from 'lucide-react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { MenuCategory, MenuItem } from '../types'
import MenuSection from '../components/MenuSection'
import { generateMenuPdf } from '../utils/menuPdf'

export default function Home() {
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

  return (
    <div>
      {/* Hero */}
      <section style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px 40px',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(200,168,78,0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <img
          src="/logo-white-transparent.png"
          alt="Tacos Miranda"
          style={{
            width: 700,
            maxWidth: '90vw',
            marginBottom: 24,
            filter: 'drop-shadow(0 0 40px rgba(200,168,78,0.1))',
          }}
        />

        <div style={{
          width: 60,
          height: 1,
          background: 'var(--gold)',
          margin: '8px 0 20px',
        }} />

        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 16,
          color: 'var(--gray)',
          fontStyle: 'italic',
          textAlign: 'center',
          maxWidth: 420,
          lineHeight: 1.6,
        }}>
          Handcrafted with white corn tortillas, cooked in premium beef tallow
        </p>

        <div style={{
          marginTop: 32,
          padding: '10px 24px',
          background: 'var(--dark-card)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <ShoppingBag size={16} color="var(--gold)" />
          <span style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
            Online Ordering - Coming Soon
          </span>
        </div>

        <a
          href="tel:6578454011"
          style={{
            marginTop: 32,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 32px',
            background: 'transparent',
            border: '1px solid var(--gold)',
            borderRadius: 4,
            color: 'var(--gold)',
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: 1,
            textDecoration: 'none',
            transition: 'background 0.2s, color 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--gold)'; e.currentTarget.style.color = 'var(--black)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--gold)' }}
        >
          <Phone size={18} />
          Call & Order Ahead: (657) 845-4011
        </a>
      </section>

      {/* Highlights */}
      <section style={{
        padding: '20px 24px 40px',
        display: 'flex',
        justifyContent: 'center',
        gap: 24,
        flexWrap: 'wrap',
      }}>
        {[
          {
            icon: <Wheat size={28} color="var(--gold)" />,
            title: 'White Corn Tortillas',
            desc: 'Most items are made with authentic white corn tortillas. Ask us about gluten-friendly options when ordering.',
          },
          {
            icon: <Flame size={28} color="var(--gold)" />,
            title: 'Beef Tallow',
            desc: 'Traditional cooking. Our meats are prepared with premium beef tallow for rich, authentic flavor.',
          },
        ].map((card, i) => (
          <div
            key={i}
            style={{
              background: 'var(--dark-card)',
              borderTop: '2px solid var(--gold)',
              borderRadius: 12,
              padding: '32px 28px',
              width: 300,
              transition: 'transform 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ marginBottom: 16 }}>{card.icon}</div>
            <h3 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 20,
              color: 'var(--white)',
              marginBottom: 8,
            }}>
              {card.title}
            </h3>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              color: 'var(--gray)',
              lineHeight: 1.6,
            }}>
              {card.desc}
            </p>
          </div>
        ))}
      </section>

      {/* Menu */}
      <section id="menu" style={{ padding: '40px 24px 80px', maxWidth: 1200, margin: '0 auto' }}>
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

        {loading ? (
          <p style={{ color: 'var(--gray)', fontSize: 14, textAlign: 'center' }}>Loading menu...</p>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 24,
          }}>
            {categories.map(cat => (
              <div
                key={cat.id}
                style={{
                  background: 'var(--dark-card)',
                  borderRadius: 12,
                  padding: '24px 20px',
                  borderTop: '2px solid var(--gold)',
                }}
              >
                <MenuSection
                  category={cat}
                  items={items.filter(i => i.category_id === cat.id)}
                  isAdmin={isAdmin}
                  onUpdate={fetchMenu}
                />
              </div>
            ))}
          </div>
        )}

      </section>

      {/* Location */}
      <section id="location" style={{ padding: '60px 24px 80px', maxWidth: 900, margin: '0 auto' }}>
        <h2 style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 36,
          color: 'var(--white)',
          textAlign: 'center',
          letterSpacing: 4,
          marginBottom: 40,
        }}>
          Find Us
        </h2>

        <div style={{
          display: 'flex',
          gap: 32,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}>
          {/* Info */}
          <div style={{
            background: 'var(--dark-card)',
            borderRadius: 12,
            borderTop: '2px solid var(--gold)',
            padding: '32px 28px',
            flex: '1 1 300px',
            maxWidth: 380,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <MapPin size={20} color="var(--gold)" />
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, color: 'var(--white)' }}>Location</h3>
            </div>
            <a
              href="https://www.google.com/maps/place/Tacos+Miranda/@33.6493169,-117.95565,17z"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--white)',
                fontSize: 15,
                lineHeight: 1.6,
                display: 'block',
                marginBottom: 28,
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--gold)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--white)'}
            >
              21582 Brookhurst St<br />
              Huntington Beach, CA 92646
            </a>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Clock size={20} color="var(--gold)" />
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, color: 'var(--white)' }}>Hours</h3>
            </div>
            <div style={{ fontSize: 14, color: 'var(--gray)', lineHeight: 2 }}>
              <p>Monday - Sunday</p>
              <p style={{ color: 'var(--white)', fontWeight: 600, fontSize: 16 }}>7 AM - 9 PM</p>
              <p style={{ color: 'var(--gold)', fontSize: 13, marginTop: 8, fontStyle: 'italic' }}>Open 7 days a week</p>
            </div>
          </div>

          {/* Map */}
          <div style={{
            flex: '1 1 400px',
            maxWidth: 500,
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid var(--border)',
          }}>
            <iframe
              title="Tacos Miranda Location"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3322.5!2d-117.95565!3d33.6493169!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x80dd21007da0f38f%3A0x241ca38d2c64035d!2sTacos%20Miranda!5e0!3m2!1sen!2sus!4v1700000000000"
              width="100%"
              height="350"
              style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg)' }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>

    </div>
  )
}
