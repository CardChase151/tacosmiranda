import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../config/supabase'
import {
  Activity, Loader2, RefreshCw, Search, Globe, Users, Eye, Layers, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react'

type PageVisitRow = {
  path: string | null
  referrer_host: string | null
  ai_bot: string | null
  session_id: string | null
  created_at: string
}

type GscResponse = {
  startDate: string
  endDate: string
  totals: { clicks: number; impressions: number; ctr: number; position: number }
  queries: { query: string; clicks: number; impressions: number; position: number }[]
  pages: { page: string; clicks: number; impressions: number; position: number }[]
}

type Source = { label: string; visits: number; sessions: number }
type Page = { path: string; views: number; sessions: number }
type Session = { sessionId: string; paths: string[]; durationSec: number }

type Aggregated = {
  pageviews: number
  sessions: number
  sources: Source[]
  pages: Page[]
  multiPage: Session[]
}

const todayISO = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const yesterdayISO = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const shiftDays = (iso: string, days: number) => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const daysBetween = (start: string, end: string) => {
  const s = new Date(start + 'T12:00:00').getTime()
  const e = new Date(end + 'T12:00:00').getTime()
  return Math.round((e - s) / 86400000) + 1
}

// Mirrors detectAiBot in trackVisit.ts so we can label rows server-recorded
// without ai_bot pre-tagged (older rows, edge cases).
function categorize(host: string | null, aiBot: string | null): string | null {
  if (aiBot) {
    const map: Record<string, string> = {
      chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini',
      perplexity: 'Perplexity', copilot: 'Copilot', grok: 'Grok', 'other-ai': 'Other AI',
    }
    return map[aiBot] || aiBot
  }
  if (!host) return 'Direct'
  const h = host.toLowerCase()
  if (h.includes('chatgpt.com') || h.includes('chat.openai') || h.includes('openai.com')) return 'ChatGPT'
  if (h.includes('claude.ai') || h.includes('anthropic.com')) return 'Claude'
  if (h.includes('perplexity.ai') || h.includes('perplexity.com')) return 'Perplexity'
  if (h.includes('gemini.google') || h.includes('bard.google') || h.includes('aistudio.google')) return 'Gemini'
  if (h.includes('copilot.microsoft') || h.includes('bing.com/chat')) return 'Copilot'
  if (h.includes('grok.com') || h.includes('x.ai')) return 'Grok'
  if (h.includes('you.com')) return 'You.com'
  if (h.includes('google.')) return 'Google Search'
  if (h.includes('bing.com') || h.includes('duckduckgo.com')) return 'Bing/DuckDuckGo'
  if (h.includes('instagram.com') || h.includes('l.instagram.com')) return 'Instagram'
  if (h.includes('tiktok.com')) return 'TikTok'
  if (h.includes('facebook.com') || h.includes('fb.com') || h.includes('m.facebook.com')) return 'Facebook'
  if (h.includes('twitter.com') || h === 't.co' || h.includes('x.com')) return 'Twitter / X'
  if (h.includes('reddit.com')) return 'Reddit'
  if (h.includes('linkedin.com') || h.includes('lnkd.in')) return 'LinkedIn'
  if (h.includes('youtube.com') || h.includes('youtu.be')) return 'YouTube'
  // DoorDash, UberEats, GrubHub — relevant for restaurants
  if (h.includes('doordash.com')) return 'DoorDash'
  if (h.includes('ubereats.com')) return 'Uber Eats'
  if (h.includes('grubhub.com')) return 'Grubhub'
  if (h.includes('yelp.com')) return 'Yelp'
  if (h.includes('tacosmiranda.com')) return null
  return host
}

const friendlyPath = (path: string | null): string => {
  if (!path || path === '/') return 'Home'
  const clean = path.split('?')[0].split('#')[0]
  if (clean === '/' || clean === '') return 'Home'
  return clean.replace(/^\//, '').split('/').map(p =>
    p.split(/[-_]/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  ).join(' › ')
}

type SourceStyle = { tag: string; tagBg: string; tagFg: string; bar: string }
const styleForSource = (label: string): SourceStyle => {
  const AI = ['ChatGPT', 'Claude', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'Other AI', 'You.com']
  const SEARCH = ['Google Search', 'Bing/DuckDuckGo']
  const SOCIAL = ['Instagram', 'TikTok', 'Facebook', 'Twitter / X', 'Reddit', 'LinkedIn', 'YouTube']
  const DELIVERY = ['DoorDash', 'Uber Eats', 'Grubhub', 'Yelp']
  if (AI.includes(label)) return { tag: 'AI', tagBg: 'rgba(167,139,250,0.15)', tagFg: '#c4b5fd', bar: '#a78bfa' }
  if (SEARCH.includes(label)) return { tag: 'Search', tagBg: 'rgba(96,165,250,0.15)', tagFg: '#93c5fd', bar: '#60a5fa' }
  if (SOCIAL.includes(label)) return { tag: 'Social', tagBg: 'rgba(244,114,182,0.15)', tagFg: '#f9a8d4', bar: '#f472b6' }
  if (DELIVERY.includes(label)) return { tag: 'Delivery', tagBg: 'rgba(251,146,60,0.15)', tagFg: '#fdba74', bar: '#fb923c' }
  if (label === 'Direct') return { tag: 'Direct', tagBg: 'rgba(148,163,184,0.15)', tagFg: '#cbd5e1', bar: '#94a3b8' }
  return { tag: 'Other', tagBg: 'rgba(234,179,8,0.15)', tagFg: '#fde68a', bar: '#eab308' }
}

function aggregate(rows: PageVisitRow[] | null): Aggregated {
  if (!rows) return { pageviews: 0, sessions: 0, sources: [], pages: [], multiPage: [] }
  const pageviews = rows.length
  const sessionIds = new Set(rows.map(r => r.session_id).filter(Boolean) as string[])
  const sessions = sessionIds.size

  const srcMap: Record<string, { visits: number; sessions: Set<string> }> = {}
  for (const r of rows) {
    const label = categorize(r.referrer_host, r.ai_bot)
    if (!label) continue
    if (!srcMap[label]) srcMap[label] = { visits: 0, sessions: new Set() }
    srcMap[label].visits++
    if (r.session_id) srcMap[label].sessions.add(r.session_id)
  }
  const sources = Object.entries(srcMap)
    .map(([label, v]) => ({ label, visits: v.visits, sessions: v.sessions.size }))
    .sort((a, b) => b.visits - a.visits)

  const pageMap: Record<string, { views: number; sessions: Set<string> }> = {}
  for (const r of rows) {
    const p = r.path || '/'
    if (!pageMap[p]) pageMap[p] = { views: 0, sessions: new Set() }
    pageMap[p].views++
    if (r.session_id) pageMap[p].sessions.add(r.session_id)
  }
  const pages = Object.entries(pageMap)
    .map(([path, v]) => ({ path, views: v.views, sessions: v.sessions.size }))
    .sort((a, b) => b.views - a.views)

  const sessMap: Record<string, { path: string | null; ts: number }[]> = {}
  for (const r of rows) {
    if (!r.session_id) continue
    if (!sessMap[r.session_id]) sessMap[r.session_id] = []
    sessMap[r.session_id].push({ path: r.path, ts: new Date(r.created_at).getTime() })
  }
  const multiPage = Object.entries(sessMap)
    .filter(([, evs]) => evs.length > 1)
    .map(([sid, evs]) => {
      evs.sort((a, b) => a.ts - b.ts)
      return {
        sessionId: sid,
        paths: evs.map(e => e.path || '/'),
        durationSec: Math.round((evs[evs.length - 1].ts - evs[0].ts) / 1000),
      }
    })
    .sort((a, b) => b.paths.length - a.paths.length)

  return { pageviews, sessions, sources, pages, multiPage }
}

type Delta = { label: string; color: string; icon: 'up' | 'down' | 'flat' | 'new' | null }
const pctDelta = (cur: number, prev: number): Delta => {
  if (prev === 0 && cur === 0) return { label: 'no change', color: 'var(--gray)', icon: 'flat' }
  if (prev === 0) return { label: 'new', color: '#34d399', icon: 'new' }
  const p = ((cur - prev) / prev) * 100
  if (p > 0) return { label: `${p.toFixed(0)}%`, color: '#34d399', icon: 'up' }
  if (p < 0) return { label: `${(-p).toFixed(0)}%`, color: '#ef4444', icon: 'down' }
  return { label: 'flat', color: 'var(--gray)', icon: 'flat' }
}

export default function AdminAnalytics() {
  const { user, isAdmin, isOwner, loading: authLoading } = useAuth()
  const allowed = isAdmin || isOwner

  const today = todayISO()
  const yesterday = yesterdayISO()

  const [startDate, setStartDate] = useState<string>(shiftDays(today, -29))
  const [endDate, setEndDate] = useState<string>(today)

  const [gscData, setGscData] = useState<GscResponse | null>(null)
  const [gscError, setGscError] = useState<string | null>(null)
  const [gscLoading, setGscLoading] = useState(false)

  const [visits, setVisits] = useState<PageVisitRow[] | null>(null)
  const [visitsPrev, setVisitsPrev] = useState<PageVisitRow[] | null>(null)
  const [visitsError, setVisitsError] = useState<string | null>(null)
  const [visitsLoading, setVisitsLoading] = useState(false)

  const fetchGsc = useCallback(async (start: string, end: string) => {
    setGscLoading(true)
    setGscError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not logged in')
      const url = `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/admin-gsc-analytics`
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ startDate: start, endDate: end }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error || `HTTP ${resp.status}`)
      setGscData(json as GscResponse)
    } catch (err) {
      setGscError((err as Error).message)
      setGscData(null)
    } finally {
      setGscLoading(false)
    }
  }, [])

  const fetchVisits = useCallback(async (start: string, end: string) => {
    setVisitsLoading(true)
    setVisitsError(null)
    try {
      const startDT = new Date(start + 'T00:00:00Z')
      const endDT = new Date(end + 'T00:00:00Z')
      endDT.setDate(endDT.getDate() + 1)
      const rangeDays = daysBetween(start, end)
      const prevStart = new Date(startDT)
      prevStart.setDate(prevStart.getDate() - rangeDays)
      const prevEnd = new Date(startDT)

      const [cur, prev] = await Promise.all([
        supabase.from('page_visits')
          .select('path,referrer_host,ai_bot,session_id,created_at')
          .gte('created_at', startDT.toISOString())
          .lt('created_at', endDT.toISOString())
          .limit(50000),
        supabase.from('page_visits')
          .select('path,referrer_host,ai_bot,session_id,created_at')
          .gte('created_at', prevStart.toISOString())
          .lt('created_at', prevEnd.toISOString())
          .limit(50000),
      ])
      if (cur.error) throw cur.error
      if (prev.error) throw prev.error
      setVisits((cur.data as PageVisitRow[]) || [])
      setVisitsPrev((prev.data as PageVisitRow[]) || [])
    } catch (err) {
      setVisitsError((err as Error).message)
      setVisits(null)
      setVisitsPrev(null)
    } finally {
      setVisitsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!allowed) return
    fetchGsc(startDate, endDate)
    fetchVisits(startDate, endDate)
  }, [startDate, endDate, allowed, fetchGsc, fetchVisits])

  const agg = aggregate(visits)
  const aggPrev = aggregate(visitsPrev)
  const avgPagesPerSession = agg.sessions > 0 ? agg.pageviews / agg.sessions : 0

  if (authLoading) {
    return <div style={wrap}><Loader2 size={20} className="spin" /> Loading…</div>
  }
  if (!user || !allowed) {
    return (
      <div style={wrap}>
        <h1 style={{ color: 'var(--gold)' }}>Not authorized</h1>
        <p style={{ color: 'var(--gray)' }}>Analytics is admin or owner only.</p>
      </div>
    )
  }

  const rangeDays = daysBetween(startDate, endDate)
  const isLast30 = endDate === today && rangeDays === 30
  const isLast7 = endDate === today && rangeDays === 7
  const isToday = startDate === today && endDate === today
  const isYesterday = startDate === yesterday && endDate === yesterday

  const setRange = (numDays: number) => {
    setEndDate(today)
    setStartDate(shiftDays(today, -(numDays - 1)))
  }
  const setSingleDay = (iso: string) => {
    setStartDate(iso)
    setEndDate(iso)
  }

  const rangeLabel = startDate === endDate
    ? startDate
    : `${startDate} → ${endDate} · ${rangeDays} days`

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Activity size={28} style={{ color: '#f472b6' }} />
          <h1 style={{ color: 'var(--gold)', fontFamily: 'var(--font-heading)', margin: 0 }}>Analytics</h1>
        </div>
        <p style={{ color: 'var(--gray)', marginBottom: 24 }}>
          Where visitors come from, what they look at, and how Google ranks tacosmiranda.com. Updates live as people browse.
        </p>

        {/* Date range card */}
        <div style={card}>
          <div style={eyebrow('#f472b6')}>Date range</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <PresetBtn active={isLast30} onClick={() => setRange(30)}>Last 30 days</PresetBtn>
            <PresetBtn active={isLast7} onClick={() => setRange(7)}>Last 7 days</PresetBtn>
            <PresetBtn active={isYesterday} onClick={() => setSingleDay(yesterday)}>Yesterday</PresetBtn>
            <PresetBtn active={isToday} onClick={() => setSingleDay(today)}>Today (live)</PresetBtn>
            <button
              onClick={() => { fetchGsc(startDate, endDate); fetchVisits(startDate, endDate) }}
              style={{
                marginLeft: 'auto', padding: '8px 14px', fontSize: 13, fontWeight: 600,
                border: 'none', borderRadius: 8, background: '#f472b6', color: '#000',
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--gray)' }}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, fontSize: 10 }}>Custom:</span>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={e => setStartDate(e.target.value)}
              style={dateInput}
            />
            <span>to</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={today}
              onChange={e => setEndDate(e.target.value)}
              style={dateInput}
            />
            <span style={{ marginLeft: 8 }}>{rangeDays} day{rangeDays !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Total traffic hero */}
        <div style={card}>
          <div style={eyebrow('#f472b6')}>Total traffic · {rangeLabel}</div>
          <p style={subtle}>
            All-source traffic. Includes Google, social, AI assistants, direct, everything. Comparison is vs the previous equal-length window.
          </p>
          <div style={statsGrid}>
            <HeroStat
              icon={<Users size={20} />}
              color="#34d399"
              label="Visitors"
              value={visitsLoading ? '…' : String(agg.sessions)}
              sub="Unique sessions"
              delta={pctDelta(agg.sessions, aggPrev.sessions)}
            />
            <HeroStat
              icon={<Eye size={20} />}
              color="#60a5fa"
              label="Pageviews"
              value={visitsLoading ? '…' : String(agg.pageviews)}
              sub="Every page load"
              delta={pctDelta(agg.pageviews, aggPrev.pageviews)}
            />
            <HeroStat
              icon={<Layers size={20} />}
              color="#a78bfa"
              label="Pages / session"
              value={visitsLoading ? '…' : avgPagesPerSession.toFixed(1)}
              sub="1.0 = bounced after one page"
            />
          </div>
          {visitsError && <p style={{ marginTop: 12, fontSize: 12, color: '#ef4444' }}>Visits: {visitsError}</p>}
        </div>

        {/* Where visitors came from */}
        <div style={card}>
          <div style={eyebrow('#f472b6')}>Where visitors came from · {rangeLabel}</div>
          <p style={subtle}>
            <strong style={{ color: 'var(--gold)' }}>{agg.pageviews} pageview{agg.pageviews !== 1 ? 's' : ''}</strong> from <strong style={{ color: 'var(--gold)' }}>{agg.sessions} session{agg.sessions !== 1 ? 's' : ''}</strong>. Each row is the best guess at where that visit started.
          </p>
          {agg.sources.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--gray)', fontStyle: 'italic', margin: 0 }}>No visits in this range yet.</p>
          ) : (
            agg.sources.map(s => {
              const st = styleForSource(s.label)
              const pct = agg.pageviews > 0 ? (s.visits / agg.pageviews) * 100 : 0
              return (
                <div key={s.label} style={rowItem}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)' }}>
                      <span style={{
                        display: 'inline-block', background: st.tagBg, color: st.tagFg,
                        fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
                        textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4, marginRight: 8,
                      }}>{st.tag}</span>
                      {s.label}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', whiteSpace: 'nowrap' }}>
                      {s.visits} · {pct.toFixed(0)}%
                    </div>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, marginTop: 8 }}>
                    <div style={{ height: 6, width: `${Math.max(pct, 2)}%`, background: st.bar, borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 6 }}>
                    {s.sessions} unique {s.sessions === 1 ? 'session' : 'sessions'}
                    {s.label === 'Direct' && <span style={{ fontStyle: 'italic', opacity: 0.7 }}> — typed URLs, bookmarks, referrer-stripped tools</span>}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Most-viewed pages */}
        <div style={card}>
          <div style={eyebrow('#f472b6')}>Most-viewed pages · {rangeLabel}</div>
          <p style={subtle}>What people look at once they're on the site.</p>
          {agg.pages.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--gray)', fontStyle: 'italic', margin: 0 }}>No pages viewed in this range.</p>
          ) : (
            agg.pages.slice(0, 8).map(p => {
              const max = agg.pages[0].views || 1
              const pct = Math.max((p.views / max) * 100, 4)
              return (
                <div key={p.path} style={rowItem}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)' }}>
                      {friendlyPath(p.path)}
                      <div style={{ fontSize: 11, color: 'var(--gray)', fontWeight: 400, fontFamily: 'monospace', marginTop: 2 }}>{p.path}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', whiteSpace: 'nowrap' }}>
                      {p.views} view{p.views !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, marginTop: 8 }}>
                    <div style={{ height: 5, width: `${pct}%`, background: '#60a5fa', borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 6 }}>{p.sessions} unique {p.sessions === 1 ? 'visitor' : 'visitors'}</div>
                </div>
              )
            })
          )}
        </div>

        {/* GSC search performance */}
        <div style={card}>
          <div style={eyebrow('#60a5fa')}>
            <Search size={11} style={{ display: 'inline-block', marginRight: 4, verticalAlign: '-1px' }} />
            Google Search performance · {rangeLabel}
          </div>
          <p style={subtle}>
            Just the Google portion of your traffic. These are GSC numbers (what Google says happened) with a 2-3 day data lag.
          </p>
          <div style={statsGrid}>
            <HeroStat icon={<Globe size={20} />} color="#60a5fa" label="Google clicks" value={gscLoading ? '…' : (gscData?.totals.clicks ?? '—').toString()} sub="From a Google result" />
            <HeroStat icon={<Eye size={20} />} color="#60a5fa" label="Impressions" value={gscLoading ? '…' : (gscData?.totals.impressions?.toLocaleString() ?? '—')} sub="Appeared in results" />
            <HeroStat icon={<Activity size={20} />} color="#60a5fa" label="CTR" value={gscLoading ? '…' : (gscData ? `${gscData.totals.ctr.toFixed(2)}%` : '—')} sub="Clicks ÷ impressions" />
            <HeroStat icon={<Layers size={20} />} color="#60a5fa" label="Avg position" value={gscLoading ? '…' : (gscData ? gscData.totals.position.toFixed(1) : '—')} sub="1=top of page 1" />
          </div>
          {gscError && <p style={{ marginTop: 12, fontSize: 12, color: '#ef4444' }}>GSC: {gscError}</p>}
        </div>

        {/* Top queries */}
        <div style={card}>
          <div style={eyebrow('#60a5fa')}>What people searched on Google · {rangeLabel}</div>
          {gscLoading ? (
            <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading…</p>
          ) : !gscData?.queries?.length ? (
            <p style={{ fontSize: 13, color: 'var(--gray)', fontStyle: 'italic', margin: 0 }}>No GSC query data yet (2-3 day lag also applies).</p>
          ) : (
            gscData.queries.slice(0, 10).map(q => (
              <div key={q.query} style={{ ...rowItem, borderLeft: '3px solid #60a5fa' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)' }}>"{q.query}"</div>
                <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
                  {q.clicks} click{q.clicks !== 1 ? 's' : ''} · ranked <strong style={{ color: 'var(--gold)' }}>#{q.position.toFixed(0)}</strong> · seen {q.impressions} times
                </div>
              </div>
            ))
          )}
        </div>

        {/* GSC top pages */}
        <div style={card}>
          <div style={eyebrow('#60a5fa')}>Top pages from Google · {rangeLabel}</div>
          {gscLoading ? (
            <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading…</p>
          ) : !gscData?.pages?.length ? (
            <p style={{ fontSize: 13, color: 'var(--gray)', fontStyle: 'italic', margin: 0 }}>No GSC page data yet.</p>
          ) : (
            gscData.pages.slice(0, 8).map(p => {
              const path = p.page.replace('https://tacosmiranda.com', '') || '/'
              return (
                <div key={p.page} style={rowItem}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)' }}>{friendlyPath(path)}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray)', fontFamily: 'monospace', marginTop: 2 }}>{path}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 6 }}>
                    {p.clicks} click{p.clicks !== 1 ? 's' : ''} · seen {p.impressions} times
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Multi-page sessions */}
        {agg.multiPage.length > 0 && (
          <div style={card}>
            <div style={eyebrow('#f472b6')}>Multi-page sessions · {rangeLabel}</div>
            <p style={subtle}>Visitors who clicked through more than one page. Higher = more engaged.</p>
            {agg.multiPage.slice(0, 8).map(s => (
              <div key={s.sessionId} style={rowItem}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)' }}>
                  {s.paths.length} pages · {s.durationSec >= 60 ? `${Math.round(s.durationSec / 60)}m ${s.durationSec % 60}s` : `${s.durationSec}s`} on site
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4, fontFamily: 'monospace' }}>
                  {s.paths.map(friendlyPath).join(' → ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function HeroStat({ icon, color, label, value, sub, delta }: {
  icon: React.ReactNode; color: string; label: string; value: string; sub: string; delta?: Delta
}) {
  return (
    <div style={{ ...card, margin: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color, marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--font-heading)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>{sub}</div>
      {delta && (
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: delta.color, display: 'flex', alignItems: 'center', gap: 4 }}>
          {delta.icon === 'up' && <ArrowUpRight size={14} />}
          {delta.icon === 'down' && <ArrowDownRight size={14} />}
          {(delta.icon === 'flat' || delta.icon === 'new') && <Minus size={14} />}
          {delta.label} <span style={{ color: 'var(--gray)', fontWeight: 400 }}>vs prior window</span>
        </div>
      )}
    </div>
  )
}

function PresetBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 600,
        border: active ? '1px solid #f472b6' : '1px solid var(--border)',
        borderRadius: 8,
        background: active ? 'rgba(244,114,182,0.15)' : 'transparent',
        color: active ? '#f472b6' : 'var(--gold)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

const wrap: React.CSSProperties = { padding: 32, minHeight: '80vh', background: 'var(--bg)' }
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 24,
  marginBottom: 24,
}
const statsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 16,
}
const subtle: React.CSSProperties = {
  fontSize: 13, color: 'var(--gray)', margin: '0 0 14px', lineHeight: 1.55,
}
const rowItem: React.CSSProperties = {
  padding: '12px 14px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  marginBottom: 10,
}
const dateInput: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 13,
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'rgba(0,0,0,0.3)',
  color: 'var(--gold)',
  colorScheme: 'dark',
}
const eyebrow = (accent: string): React.CSSProperties => ({
  fontSize: 11,
  fontWeight: 700,
  color: accent,
  letterSpacing: 1,
  textTransform: 'uppercase',
  marginBottom: 10,
})
