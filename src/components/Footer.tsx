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
