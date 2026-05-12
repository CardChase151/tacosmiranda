// First-party page visit tracking for tacosmiranda.com. Logs every route view
// (not just initial arrival) to public.page_visits in Supabase so we can
// answer:
//   - Where did the visit start? (referrer, AI source, social, direct)
//   - Which screens did they view most?
//   - How many pages per session?
//
// Privacy stance: no IP, no precise location, no cookies. Only referrer,
// user-agent, path, and a random per-session id (sessionStorage — cleared
// on tab close).

import { supabase } from '../config/supabase'

type AiBot =
  | 'chatgpt'
  | 'claude'
  | 'perplexity'
  | 'gemini'
  | 'copilot'
  | 'grok'
  | 'other-ai'
  | null

function detectAiBot(referrerHost: string | null, ua: string): AiBot {
  const refLow = (referrerHost || '').toLowerCase()
  const uaLow = (ua || '').toLowerCase()
  if (
    refLow.includes('chatgpt.com') || refLow.includes('chat.openai') || refLow.includes('openai.com') ||
    uaLow.includes('chatgpt') || uaLow.includes('gptbot') || uaLow.includes('oai-searchbot')
  ) return 'chatgpt'
  if (
    refLow.includes('claude.ai') || refLow.includes('anthropic.com') ||
    uaLow.includes('anthropic-ai') || uaLow.includes('claude-web') || uaLow.includes('claudebot')
  ) return 'claude'
  if (
    refLow.includes('perplexity.ai') || refLow.includes('perplexity.com') ||
    uaLow.includes('perplexitybot') || uaLow.includes('perplexity-user')
  ) return 'perplexity'
  if (
    refLow.includes('gemini.google') || refLow.includes('bard.google') ||
    refLow.includes('aistudio.google') || uaLow.includes('google-extended')
  ) return 'gemini'
  if (
    refLow.includes('bing.com/chat') || refLow.includes('copilot.microsoft') ||
    refLow.includes('copilot.cloud.microsoft') || uaLow.includes('copilot')
  ) return 'copilot'
  if (refLow.includes('grok.com') || refLow.includes('x.ai') || uaLow.includes('grok')) return 'grok'
  if (refLow.includes('you.com') || uaLow.includes('youbot') || uaLow.includes('ccbot')) return 'other-ai'
  return null
}

function getOrCreateSessionId(): string | null {
  if (typeof window === 'undefined') return null
  let sid = sessionStorage.getItem('_pv_sid')
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36)
    sessionStorage.setItem('_pv_sid', sid)
  }
  return sid
}

export function logPageVisit(): void {
  if (typeof window === 'undefined') return

  try {
    const url = new URL(window.location.href)
    const referrer = document.referrer || ''
    let referrerHost = ''
    try {
      if (referrer) referrerHost = new URL(referrer).hostname.toLowerCase()
    } catch {
      // bad referrer URL — leave host empty
    }

    // Internal navigations have a referrer pointing back at our own host.
    // We still log them so most-viewed-pages works, but null out
    // referrer_host so they don't pollute attribution.
    const ourHost = window.location.hostname.toLowerCase()
    const isInternal = referrerHost === ourHost
    const effectiveReferrerHost = isInternal ? null : (referrerHost || null)

    const aiBot = detectAiBot(effectiveReferrerHost, navigator.userAgent)
    const sid = getOrCreateSessionId()

    const payload = {
      path: url.pathname,
      full_url: url.href.slice(0, 1000),
      referrer: !isInternal && referrer ? referrer.slice(0, 1000) : null,
      referrer_host: effectiveReferrerHost,
      user_agent: (navigator.userAgent || '').slice(0, 500),
      ai_bot: aiBot,
      screen_w: window.screen ? window.screen.width : null,
      screen_h: window.screen ? window.screen.height : null,
      session_id: sid,
    }

    supabase.from('page_visits').insert(payload).then(() => {})
  } catch {
    // Tracking must never break the app
  }
}

// Initial pageload — captures the entry referrer.
;(function trackInitialLoad() {
  if (typeof window === 'undefined') return
  if (sessionStorage.getItem('_pv_first_logged')) return
  sessionStorage.setItem('_pv_first_logged', '1')
  logPageVisit()
})()
