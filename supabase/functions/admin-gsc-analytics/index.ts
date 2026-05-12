// Edge Function: admin-gsc-analytics
// Admin/owner-only proxy to Google Search Console API for tacosmiranda.com.
//
// Auth: requires a Bearer JWT from a profile with is_admin OR is_owner.
// Signs a Google OAuth JWT using the GSC_SERVICE_ACCOUNT_JSON secret,
// exchanges for an access token, queries GSC, returns aggregated JSON.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SITE = 'https://tacosmiranda.com/';
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function pemToBytes(pem: string): Uint8Array {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

async function getGoogleAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: sa.private_key_id };
  const claim = {
    iss: sa.client_email,
    scope: GSC_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const keyBytes = pemToBytes(sa.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    cryptoKey,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`google token: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

async function gscQuery(token: string, dimensions: string[], startDate: string, endDate: string, rowLimit = 1000) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate, dimensions, rowLimit }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`gsc: ${resp.status} ${txt}`);
  }
  return await resp.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'unauthorized' }, 401);

  const supaAdmin = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  const { data: { user }, error: userErr } = await supaAdmin.auth.getUser(jwt);
  if (userErr || !user) return json({ error: `invalid jwt: ${userErr?.message || 'no user'}` }, 401);
  const { data: profile } = await supaAdmin.from('profiles').select('is_admin, is_owner').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin && !profile?.is_owner) return json({ error: 'admin or owner only' }, 403);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const startDate: string = payload?.startDate;
  const endDate: string = payload?.endDate ?? startDate;
  if (!startDate) return json({ error: 'startDate required (YYYY-MM-DD)' }, 400);

  let saJson: any;
  try { saJson = JSON.parse(Deno.env.get('GSC_SERVICE_ACCOUNT_JSON') || '{}'); } catch {
    return json({ error: 'GSC_SERVICE_ACCOUNT_JSON not set or invalid' }, 500);
  }
  let token: string;
  try { token = await getGoogleAccessToken(saJson); } catch (err) {
    return json({ error: `google auth: ${(err as Error).message}` }, 500);
  }

  try {
    const [totals, queries, pages] = await Promise.all([
      gscQuery(token, [], startDate, endDate, 1),
      gscQuery(token, ['query'], startDate, endDate, 10),
      gscQuery(token, ['page'], startDate, endDate, 10),
    ]);
    const t = (totals.rows && totals.rows[0]) || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    return json({
      startDate, endDate,
      totals: {
        clicks: Math.round(t.clicks || 0),
        impressions: Math.round(t.impressions || 0),
        ctr: (t.ctr || 0) * 100,
        position: t.position || 0,
      },
      queries: (queries.rows || []).map((r: any) => ({
        query: r.keys[0], clicks: Math.round(r.clicks || 0), impressions: Math.round(r.impressions || 0), position: r.position || 0,
      })),
      pages: (pages.rows || []).map((r: any) => ({
        page: r.keys[0], clicks: Math.round(r.clicks || 0), impressions: Math.round(r.impressions || 0), position: r.position || 0,
      })),
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
