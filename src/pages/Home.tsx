import { useNavigate } from 'react-router-dom'
import { Wheat, Flame } from 'lucide-react'

export default function Home() {
  const navigate = useNavigate()

  return (
    <div>
      {/* Hero */}
      <section style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
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
            width: 280,
            maxWidth: '70vw',
            marginBottom: 24,
            filter: 'drop-shadow(0 0 40px rgba(200,168,78,0.1))',
          }}
        />

        <div style={{
          width: 60,
          height: 1,
          background: 'var(--gold)',
          margin: '16px 0 24px',
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

        <button
          onClick={() => navigate('/menu')}
          style={{
            marginTop: 48,
            padding: '14px 40px',
            background: 'var(--gold)',
            color: 'var(--black)',
            border: 'none',
            borderRadius: 4,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: 'uppercase',
            transition: 'box-shadow 0.3s, transform 0.2s',
            boxShadow: '0 0 0 rgba(200,168,78,0)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.boxShadow = '0 0 24px rgba(200,168,78,0.3)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.boxShadow = '0 0 0 rgba(200,168,78,0)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          View Our Menu
        </button>
      </section>

      {/* Highlights */}
      <section style={{
        padding: '60px 24px 80px',
        display: 'flex',
        justifyContent: 'center',
        gap: 24,
        flexWrap: 'wrap',
      }}>
        {[
          {
            icon: <Wheat size={28} color="var(--gold)" />,
            title: 'White Corn Tortillas',
            desc: 'Gluten-friendly. Every taco, burrito, and quesadilla starts with authentic white corn tortillas.',
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
    </div>
  )
}
