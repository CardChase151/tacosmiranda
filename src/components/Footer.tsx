export default function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border)',
      padding: '40px 24px',
      textAlign: 'center',
    }}>
      <img
        src="/logo-white-transparent.png"
        alt="Tacos Miranda"
        style={{ height: 50, opacity: 0.6, marginBottom: 16 }}
      />
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        color: 'var(--gray-dark)',
        letterSpacing: 1,
      }}>
        White Corn Tortillas &middot; Cooked in Beef Tallow
      </p>
      <a
        href="tel:6578454011"
        style={{
          display: 'block',
          fontFamily: 'var(--font-body)',
          fontSize: 15,
          color: 'var(--gold)',
          marginTop: 12,
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        (657) 845-4011
      </a>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 12,
        color: 'var(--gray-dark)',
        marginTop: 8,
      }}>
        21582 Brookhurst St, Huntington Beach, CA 92646
      </p>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 12,
        color: 'var(--gray-dark)',
        marginTop: 12,
        opacity: 0.5,
      }}>
        &copy; {new Date().getFullYear()} Tacos Miranda. All rights reserved.
      </p>
    </footer>
  )
}
