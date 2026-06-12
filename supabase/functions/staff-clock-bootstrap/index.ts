import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Bootstrap endpoint for the offline-first staff clock kiosk.
// Returns everything the device needs to operate WITHOUT a network:
//   - roster:      active staff with PINs, so PINs validate on-device
//   - geofence:    allowed locations, so the distance check runs on-device
//   - open_shifts: shifts with no clock-out, so a wiped cache recovers state
//
// The geofence config lives here (single source of truth). To recalibrate a
// location or change a radius, edit ALLOWED_LOCATIONS and redeploy.

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

const ALLOWED_LOCATIONS = [
  // Recalibrated 2026-06-11 from on-site kiosk reading at the store.
  { name: 'Tacos Miranda', lat: 33.64934, lng: -117.95297, radius_m: 500 },
  // Chase's home for testing (3261 Colorado Ln, Costa Mesa).
  { name: 'Home (test)', lat: 33.68983, lng: -117.92811, radius_m: 100 },
]

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { data: staff } = await supabase
    .from('staff')
    .select('id, first_name, last_name, pin, active')
    .eq('active', true)

  const { data: openShifts } = await supabase
    .from('time_clock')
    .select('id, staff_id, clock_in_at, clock_in_lat, clock_in_lng')
    .is('clock_out_at', null)

  return json({
    server_time: new Date().toISOString(),
    roster: staff || [],
    geofence: ALLOWED_LOCATIONS,
    open_shifts: openShifts || [],
  })
})
