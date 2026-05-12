// Hooks React Router's location into the page_visits tracker. Mount once
// inside the BrowserRouter and every subsequent route change logs a row to
// public.page_visits. Skips the first effect run since trackVisit.ts's IIFE
// already logged the initial pageload.

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { logPageVisit } from './trackVisit'

export function usePageViewTracker(): void {
  const location = useLocation()
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    logPageVisit()
  }, [location.pathname, location.search])
}
