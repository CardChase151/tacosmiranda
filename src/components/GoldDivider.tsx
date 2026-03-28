export default function GoldDivider() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      margin: '32px 0',
    }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, var(--gold), transparent)' }} />
      <div style={{
        width: 8,
        height: 8,
        background: 'var(--gold)',
        transform: 'rotate(45deg)',
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, var(--gold), transparent)' }} />
    </div>
  )
}
