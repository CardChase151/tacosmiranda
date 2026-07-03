import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Sync endpoint for the offline-first staff clock kiosk.
// Accepts a batch of device-owned shift rows and upserts them into time_clock
// by id. Because the device generates each shift's UUID, re-sending the same
// shift is idempotent — no duplicate punches if a sync is retried.
// Also accepts `acks`: shift ids whose forgotten-clock-out warning the staff
// member acknowledged at the kiosk. Sets ack_at once; re-sends are no-ops.
//
// Trust model: the geofence + PIN checks already happened on-device at punch
// time, and the device only holds the obscure kiosk URL. We store the recorded
// coords on every row so any anomaly stays auditable after the fact.

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }

  const shifts = Array.isArray(body?.shifts) ? body.shifts : []
  const ackIds: string[] = Array.isArray(body?.acks)
    ? body.acks.filter((id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id))
    : []
  if (!Array.isArray(body?.shifts) && ackIds.length === 0) {
    return json({ error: 'shifts array required' }, 400)
  }

  let acked: string[] = []
  if (ackIds.length > 0) {
    const { error: ackErr } = await supabase
      .from('time_clock')
      .update({ ack_at: new Date().toISOString() })
      .in('id', ackIds)
      .eq('auto_closed', true)
      .is('ack_at', null)
    // Treat the whole batch as acknowledged even if some rows were already
    // acked or admin-deleted — the device just needs to stop re-sending them.
    if (!ackErr) acked = ackIds
  }

  const rows: any[] = []
  const accepted: string[] = []
  for (const s of shifts) {
    if (!s || typeof s.id !== 'string' || !UUID_RE.test(s.id)) continue
    if (typeof s.staff_id !== 'string' || !UUID_RE.test(s.staff_id)) continue
    if (typeof s.clock_in_at !== 'string') continue

    const row: Record<string, unknown> = {
      id: s.id,
      staff_id: s.staff_id,
      clock_in_at: s.clock_in_at,
      clock_out_at: typeof s.clock_out_at === 'string' ? s.clock_out_at : null,
      clock_in_lat: isFiniteNum(s.clock_in_lat) ? s.clock_in_lat : null,
      clock_in_lng: isFiniteNum(s.clock_in_lng) ? s.clock_in_lng : null,
      clock_out_lat: isFiniteNum(s.clock_out_lat) ? s.clock_out_lat : null,
      clock_out_lng: isFiniteNum(s.clock_out_lng) ? s.clock_out_lng : null,
    }
    rows.push(row)
    accepted.push(s.id)
  }

  if (rows.length === 0) {
    return json({ ok: true, synced: [], acked, server_time: new Date().toISOString() })
  }

  const { error } = await supabase.from('time_clock').upsert(rows, { onConflict: 'id' })
  if (error) return json({ error: 'Sync failed', detail: error.message }, 500)

  return json({ ok: true, synced: accepted, acked, server_time: new Date().toISOString() })
})
