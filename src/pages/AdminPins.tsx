import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../config/supabase'
import { Plus, Pencil, Power, PowerOff, Trash2, Users, Clock, AlertCircle, AlertTriangle, X, RotateCcw } from 'lucide-react'

type Staff = {
  id: string
  first_name: string
  last_name: string
  pin: string
  hourly_rate: number | null
  active: boolean
  created_at: string
  strikes_reset_at: string | null
}

type Shift = {
  id: string
  staff_id: string
  clock_in_at: string
  clock_out_at: string | null
  auto_closed: boolean
  edited_at: string | null
}

type Range = 'today' | 'week' | 'month' | 'all'

function startOf(r: Range): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (r === 'today') return d
  if (r === 'week') {
    const day = d.getDay()
    const diff = day === 0 ? 6 : day - 1
    d.setDate(d.getDate() - diff)
    return d
  }
  if (r === 'month') return new Date(d.getFullYear(), d.getMonth(), 1)
  return new Date(0)
}

function generatePin(existing: string[]): string {
  for (let i = 0; i < 50; i++) {
    const p = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')
    if (!existing.includes(p)) return p
  }
  return Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')
}

function shiftHours(shift: Shift): number | null {
  if (!shift.clock_out_at) return null
  const ms = new Date(shift.clock_out_at).getTime() - new Date(shift.clock_in_at).getTime()
  return ms / (1000 * 60 * 60)
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ISO ↔ <input type="datetime-local"> (browser-local time, which is LA here).
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export default function AdminPins() {
  const { user, isAdmin, loading } = useAuth()
  const [staff, setStaff] = useState<Staff[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [range, setRange] = useState<Range>('week')
  const [editing, setEditing] = useState<Partial<Staff> | null>(null)
  const [busy, setBusy] = useState(false)
  // Shift being corrected: datetime-local strings, '' out = still open.
  const [editingShift, setEditingShift] = useState<{ id: string; inVal: string; outVal: string; auto_closed: boolean } | null>(null)
  const [strikes, setStrikes] = useState(0)

  const selected = useMemo(() => staff.find((s) => s.id === selectedId) || null, [staff, selectedId])

  const fetchStaff = async () => {
    const { data } = await supabase
      .from('staff')
      .select('id, first_name, last_name, pin, hourly_rate, active, created_at, strikes_reset_at')
      .order('first_name')
    setStaff((data as Staff[]) || [])
  }

  const fetchShifts = async (staffId: string) => {
    const since = startOf(range).toISOString()
    const { data } = await supabase
      .from('time_clock')
      .select('id, staff_id, clock_in_at, clock_out_at, auto_closed, edited_at')
      .eq('staff_id', staffId)
      .gte('clock_in_at', since)
      .order('clock_in_at', { ascending: false })
    setShifts((data as Shift[]) || [])
  }

  // Forgotten clock-outs since the last strike reset — independent of the
  // visible date range, so the count matches what the kiosk shows staff.
  const fetchStrikes = async (staffId: string, resetAt: string | null) => {
    let q = supabase
      .from('time_clock')
      .select('id', { count: 'exact', head: true })
      .eq('staff_id', staffId)
      .eq('auto_closed', true)
    if (resetAt) q = q.gt('clock_in_at', resetAt)
    const { count } = await q
    setStrikes(count || 0)
  }

  useEffect(() => {
    if (!loading && user && isAdmin) fetchStaff()
  }, [loading, user, isAdmin])

  useEffect(() => {
    if (selectedId) fetchShifts(selectedId)
    else setShifts([])
  }, [selectedId, range])

  useEffect(() => {
    if (selected) fetchStrikes(selected.id, selected.strikes_reset_at)
    else setStrikes(0)
  }, [selected])

  const openCreate = () => {
    setEditing({
      first_name: '',
      last_name: '',
      pin: generatePin(staff.map((s) => s.pin)),
      hourly_rate: null,
      active: true,
    })
  }

  const openEdit = (s: Staff) => {
    setEditing({ ...s })
  }

  const saveStaff = async () => {
    if (!editing) return
    const fn = (editing.first_name || '').trim()
    const ln = (editing.last_name || '').trim()
    const pin = (editing.pin || '').trim()
    if (!fn || !ln || !/^\d{6}$/.test(pin)) {
      alert('First name, last name, and a 6-digit PIN are required.')
      return
    }
    setBusy(true)
    const payload = {
      first_name: fn,
      last_name: ln,
      pin,
      hourly_rate: editing.hourly_rate != null && !isNaN(Number(editing.hourly_rate)) ? Number(editing.hourly_rate) : null,
      active: editing.active ?? true,
    }
    let err: any = null
    if (editing.id) {
      const r = await supabase.from('staff').update(payload).eq('id', editing.id)
      err = r.error
    } else {
      const r = await supabase.from('staff').insert(payload)
      err = r.error
    }
    setBusy(false)
    if (err) {
      if (err.message?.includes('staff_pin_key') || err.code === '23505') {
        alert('That PIN is already in use. Pick a different one.')
      } else {
        alert(err.message || 'Save failed')
      }
      return
    }
    setEditing(null)
    fetchStaff()
  }

  const toggleActive = async (s: Staff) => {
    await supabase.from('staff').update({ active: !s.active }).eq('id', s.id)
    fetchStaff()
  }

  const removeStaff = async (s: Staff) => {
    if (!window.confirm(`Delete ${s.first_name} ${s.last_name}? Their time history will be deleted too.`)) return
    await supabase.from('staff').delete().eq('id', s.id)
    if (selectedId === s.id) setSelectedId(null)
    fetchStaff()
  }

  // ─── shift corrections ─────────────────────────────────────────────────────
  const openShiftEdit = (sh: Shift, prefillOutNow = false) => {
    setEditingShift({
      id: sh.id,
      inVal: toLocalInput(sh.clock_in_at),
      outVal: sh.clock_out_at ? toLocalInput(sh.clock_out_at) : (prefillOutNow ? toLocalInput(new Date().toISOString()) : ''),
      auto_closed: sh.auto_closed,
    })
  }

  const saveShift = async () => {
    if (!editingShift || !selectedId) return
    const inIso = fromLocalInput(editingShift.inVal)
    const outIso = fromLocalInput(editingShift.outVal)
    if (!inIso) { alert('Clock-in time is required.'); return }
    if (editingShift.outVal && !outIso) { alert('Clock-out time is invalid.'); return }
    if (outIso && outIso <= inIso) { alert('Clock-out must be after clock-in.'); return }
    setBusy(true)
    const { error } = await supabase
      .from('time_clock')
      .update({ clock_in_at: inIso, clock_out_at: outIso, edited_at: new Date().toISOString() })
      .eq('id', editingShift.id)
    setBusy(false)
    if (error) { alert(error.message || 'Save failed'); return }
    setEditingShift(null)
    fetchShifts(selectedId)
  }

  const deleteShift = async () => {
    if (!editingShift || !selectedId) return
    if (!window.confirm('Delete this shift entry? This cannot be undone.')) return
    setBusy(true)
    const { error } = await supabase.from('time_clock').delete().eq('id', editingShift.id)
    setBusy(false)
    if (error) { alert(error.message || 'Delete failed'); return }
    setEditingShift(null)
    fetchShifts(selectedId)
    if (selected) fetchStrikes(selected.id, selected.strikes_reset_at)
  }

  const resetStrikes = async () => {
    if (!selected) return
    if (!window.confirm(`Reset forgotten clock-out count for ${selected.first_name}?`)) return
    await supabase.from('staff').update({ strikes_reset_at: new Date().toISOString() }).eq('id', selected.id)
    await fetchStaff()
    fetchStrikes(selected.id, new Date().toISOString())
  }

  // ─── totals ────────────────────────────────────────────────────────────────
  const closedHours = shifts.filter((s) => s.clock_out_at).reduce((sum, s) => sum + (shiftHours(s) || 0), 0)
  const openCount = shifts.filter((s) => !s.clock_out_at).length
  const estimatedPay = selected?.hourly_rate != null ? closedHours * selected.hourly_rate : null

  // ─── styles ────────────────────────────────────────────────────────────────
  const page: React.CSSProperties = {
    minHeight: '100vh',
    background: '#0a0a0a',
    color: '#fff',
    padding: 24,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  }
  const wrap: React.CSSProperties = { maxWidth: 1280, margin: '0 auto' }
  const h1: React.CSSProperties = { fontSize: 28, fontWeight: 800, margin: '0 0 24px' }
  const cardStyle: React.CSSProperties = {
    background: '#161616',
    border: '1px solid #2a2a2a',
    borderRadius: 16,
    padding: 20,
  }
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 2.5fr', gap: 20 }
  const btn: React.CSSProperties = {
    background: '#fbbf24', color: '#0a0a0a', border: 'none', borderRadius: 10,
    padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 8,
  }
  const ghostBtn: React.CSSProperties = {
    background: 'transparent', color: '#fff', border: '1px solid #333', borderRadius: 8,
    padding: '6px 10px', fontSize: 12, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  }
  const rangeBtn = (active: boolean): React.CSSProperties => ({
    background: active ? '#fbbf24' : 'transparent',
    color: active ? '#0a0a0a' : '#aaa',
    border: '1px solid ' + (active ? '#fbbf24' : '#333'),
    borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  })

  if (loading) return <div style={page}>Loading…</div>
  if (!user || !isAdmin) return <div style={page}>Admin access required.</div>

  return (
    <div style={page}>
      <div style={wrap}>
        <h1 style={h1}>PINs &amp; Time Clock</h1>

        <div style={grid}>
          {/* ─── Staff list ─────────────────────────────────────────────── */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700 }}>
                <Users size={18} /> Staff ({staff.length})
              </div>
              <button style={btn} onClick={openCreate}>
                <Plus size={16} /> Add
              </button>
            </div>

            {staff.length === 0 && (
              <div style={{ color: '#666', fontSize: 14, textAlign: 'center', padding: 24 }}>
                No staff yet. Click "Add" to create the first one.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {staff.map((s) => {
                const isSel = selectedId === s.id
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      background: isSel ? '#1f1f1f' : '#121212',
                      border: '1px solid ' + (isSel ? '#fbbf24' : '#222'),
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, opacity: s.active ? 1 : 0.5 }}>
                        {s.first_name} {s.last_name}
                      </div>
                      <div style={{ fontSize: 12, color: '#888', fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>
                        PIN {s.pin} {s.hourly_rate != null && `• $${s.hourly_rate.toFixed(2)}/hr`}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleActive(s) }}
                      title={s.active ? 'Deactivate' : 'Activate'}
                      style={{ ...ghostBtn, padding: 6 }}
                    >
                      {s.active ? <Power size={14} color="#22c55e" /> : <PowerOff size={14} color="#ef4444" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(s) }}
                      title="Edit"
                      style={{ ...ghostBtn, padding: 6 }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeStaff(s) }}
                      title="Delete"
                      style={{ ...ghostBtn, padding: 6, borderColor: '#332' }}
                    >
                      <Trash2 size={14} color="#ef4444" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ─── Time history detail ────────────────────────────────────── */}
          <div style={cardStyle}>
            {!selected && (
              <div style={{ color: '#666', fontSize: 14, textAlign: 'center', padding: 48 }}>
                Select a staff member to view their time history.
              </div>
            )}

            {selected && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>
                      {selected.first_name} {selected.last_name}
                    </div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>
                      PIN {selected.pin}
                      {selected.hourly_rate != null && ` • $${selected.hourly_rate.toFixed(2)}/hr`}
                      {!selected.active && ' • INACTIVE'}
                    </div>
                  </div>
                  <button style={ghostBtn} onClick={() => openEdit(selected)}>
                    <Pencil size={14} /> Edit
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  {(['today', 'week', 'month', 'all'] as Range[]).map((r) => (
                    <button key={r} style={rangeBtn(range === r)} onClick={() => setRange(r)}>
                      {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : r === 'month' ? 'This Month' : 'All Time'}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                  <div style={{ background: '#121212', border: '1px solid #222', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 11, color: '#888', letterSpacing: 1, marginBottom: 6 }}>HOURS</div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>{closedHours.toFixed(2)}</div>
                  </div>
                  <div style={{ background: '#121212', border: '1px solid #222', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 11, color: '#888', letterSpacing: 1, marginBottom: 6 }}>EST. PAY</div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>
                      {estimatedPay != null ? `$${estimatedPay.toFixed(2)}` : '—'}
                    </div>
                  </div>
                  <div style={{ background: '#121212', border: '1px solid #222', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 11, color: '#888', letterSpacing: 1, marginBottom: 6 }}>OPEN SHIFTS</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: openCount > 0 ? '#f59e0b' : '#fff' }}>
                      {openCount}
                    </div>
                  </div>
                  <div style={{ background: '#121212', border: '1px solid ' + (strikes > 0 ? '#7c4a00' : '#222'), borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 11, color: '#888', letterSpacing: 1, marginBottom: 6 }}>FORGOT CLOCK-OUT</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: strikes >= 3 ? '#ef4444' : strikes > 0 ? '#f59e0b' : '#fff' }}>
                        {strikes}
                      </div>
                      {strikes > 0 && (
                        <button onClick={resetStrikes} title="Reset count" style={{ ...ghostBtn, padding: '4px 8px', fontSize: 11 }}>
                          <RotateCcw size={12} /> Reset
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {shifts.length === 0 && (
                  <div style={{ color: '#666', fontSize: 14, textAlign: 'center', padding: 24 }}>
                    No shifts in this range.
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {shifts.map((sh) => {
                    const hrs = shiftHours(sh)
                    const open = !sh.clock_out_at
                    return (
                      <div
                        key={sh.id}
                        style={{
                          background: '#121212',
                          border: '1px solid ' + (open ? '#7c4a00' : '#222'),
                          borderRadius: 10,
                          padding: 12,
                          display: 'grid',
                          gridTemplateColumns: '140px 1fr auto auto',
                          gap: 12,
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(sh.clock_in_at)}</div>
                        <div style={{ fontSize: 13, color: '#bbb', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span>
                            In {fmtTime(sh.clock_in_at)}
                            {sh.clock_out_at && <> &nbsp;·&nbsp; Out {fmtTime(sh.clock_out_at)}</>}
                          </span>
                          {sh.auto_closed && (
                            <span
                              title="Forgot to clock out — capped at 10 PM automatically"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700,
                                color: '#f59e0b', background: '#2a1e08', border: '1px solid #7c4a00',
                                borderRadius: 6, padding: '2px 6px', letterSpacing: 0.5,
                              }}
                            >
                              <AlertTriangle size={10} /> AUTO
                            </span>
                          )}
                          {sh.edited_at && (
                            <span title={`Corrected by admin ${fmtDate(sh.edited_at)}`} style={{ fontSize: 10, color: '#777', fontStyle: 'italic' }}>
                              edited
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: open ? '#f59e0b' : '#fff' }}>
                          {open ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <AlertCircle size={14} /> OPEN
                            </span>
                          ) : (
                            `${hrs!.toFixed(2)} hrs`
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {open && (
                            <button
                              onClick={() => openShiftEdit(sh, true)}
                              title="Set clock-out time"
                              style={{ ...ghostBtn, padding: '5px 9px', fontSize: 11, borderColor: '#7c4a00', color: '#f59e0b' }}
                            >
                              Set out
                            </button>
                          )}
                          <button onClick={() => openShiftEdit(sh)} title="Edit shift" style={{ ...ghostBtn, padding: 6 }}>
                            <Pencil size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── Shift correction modal ───────────────────────────────────────── */}
      {editingShift && (
        <div
          onClick={() => setEditingShift(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 440, background: '#161616',
              border: '1px solid #2a2a2a', borderRadius: 16, padding: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Edit Shift</div>
              <button onClick={() => setEditingShift(null)} style={{ ...ghostBtn, padding: 6 }}>
                <X size={16} />
              </button>
            </div>
            {editingShift.auto_closed && (
              <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={12} /> Auto-closed at 10 PM — set the real clock-out time below.
              </div>
            )}

            <Field label="Clock in">
              <input
                type="datetime-local"
                value={editingShift.inVal}
                onChange={(e) => setEditingShift({ ...editingShift, inVal: e.target.value })}
                style={{
                  width: '100%', background: '#0a0a0a', color: '#fff', border: '1px solid #2a2a2a',
                  borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box', colorScheme: 'dark',
                }}
              />
            </Field>
            <Field label="Clock out (leave empty to keep the shift open)">
              <input
                type="datetime-local"
                value={editingShift.outVal}
                onChange={(e) => setEditingShift({ ...editingShift, outVal: e.target.value })}
                style={{
                  width: '100%', background: '#0a0a0a', color: '#fff', border: '1px solid #2a2a2a',
                  borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box', colorScheme: 'dark',
                }}
              />
            </Field>

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button
                onClick={deleteShift}
                disabled={busy}
                style={{
                  ...ghostBtn, justifyContent: 'center', padding: '12px 14px',
                  borderColor: '#3a1a1a', color: '#ef4444', opacity: busy ? 0.6 : 1,
                }}
              >
                <Trash2 size={14} /> Delete
              </button>
              <button
                onClick={() => setEditingShift(null)}
                style={{ ...ghostBtn, flex: 1, justifyContent: 'center', padding: '12px' }}
              >
                Cancel
              </button>
              <button
                onClick={saveShift}
                disabled={busy}
                style={{ ...btn, flex: 1, justifyContent: 'center', padding: '12px', opacity: busy ? 0.6 : 1 }}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit / Create modal ──────────────────────────────────────────── */}
      {editing && (
        <div
          onClick={() => setEditing(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 440, background: '#161616',
              border: '1px solid #2a2a2a', borderRadius: 16, padding: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {editing.id ? 'Edit Staff' : 'Add Staff'}
              </div>
              <button onClick={() => setEditing(null)} style={{ ...ghostBtn, padding: 6 }}>
                <X size={16} />
              </button>
            </div>

            <Field label="First name">
              <Input
                value={editing.first_name || ''}
                onChange={(v) => setEditing({ ...editing, first_name: v })}
              />
            </Field>
            <Field label="Last name">
              <Input
                value={editing.last_name || ''}
                onChange={(v) => setEditing({ ...editing, last_name: v })}
              />
            </Field>
            <Field label="6-digit PIN">
              <Input
                value={editing.pin || ''}
                onChange={(v) => setEditing({ ...editing, pin: v.replace(/\D/g, '').slice(0, 6) })}
                mono
              />
            </Field>
            <Field label="Hourly rate (admin-only view, optional)">
              <Input
                value={editing.hourly_rate?.toString() || ''}
                onChange={(v) => setEditing({ ...editing, hourly_rate: v === '' ? null : Number(v) })}
                placeholder="20.00"
              />
            </Field>

            {editing.id && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={editing.active ?? true}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                Active
              </label>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button
                onClick={() => setEditing(null)}
                style={{ ...ghostBtn, flex: 1, justifyContent: 'center', padding: '12px' }}
              >
                Cancel
              </button>
              <button
                onClick={saveStaff}
                disabled={busy}
                style={{ ...btn, flex: 1, justifyContent: 'center', padding: '12px', opacity: busy ? 0.6 : 1 }}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 6, letterSpacing: 0.5 }}>{label}</div>
      {children}
    </div>
  )
}

function Input({
  value, onChange, mono, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  mono?: boolean
  placeholder?: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        background: '#0a0a0a',
        color: '#fff',
        border: '1px solid #2a2a2a',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 14,
        fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
        boxSizing: 'border-box',
      }}
    />
  )
}
