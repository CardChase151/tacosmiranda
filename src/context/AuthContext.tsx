import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../config/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  profileLoading: boolean
  // Staff or above. Can manage day-to-day operations (orders, 86 items, view dashboard).
  isAdmin: boolean
  // The actual restaurant owner. Can edit menu/prices, see financials, change billing/settings.
  isOwner: boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const profileFetchRef = useRef<{ cancelled: boolean } | null>(null)

  // Auth listener — NEVER make Supabase DB calls here (see AUTH_PLAYBOOK.md).
  // Profile data is fetched in the separate useEffect below.
  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return
      setSession(session)
      setUser(session?.user ?? null)
      // Set profileLoading synchronously with user so RequireRole doesn't see a
      // false "ready" frame between the auth update and the profile-fetch effect.
      if (session?.user) {
        setProfileLoading(true)
      } else {
        setProfileLoading(false)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        setProfileLoading(true)
      } else {
        setIsAdmin(false)
        setIsOwner(false)
        setProfileLoading(false)
      }
      setLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Profile fetch — separate effect watching user.id, with 5s timeout + cancellation.
  useEffect(() => {
    if (!user?.id) {
      setIsAdmin(false)
      setIsOwner(false)
      setProfileLoading(false)
      return
    }

    if (profileFetchRef.current) profileFetchRef.current.cancelled = true
    const fetchState = { cancelled: false }
    profileFetchRef.current = fetchState

    setProfileLoading(true)

    const fetchProfile = async () => {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
        })
        const result = await Promise.race([
          supabase.from('profiles').select('is_admin, is_owner').eq('id', user.id).single(),
          timeoutPromise,
        ])
        if (fetchState.cancelled) return
        const { data } = result as { data: { is_admin?: boolean; is_owner?: boolean } | null }
        setIsAdmin(data?.is_admin || false)
        setIsOwner(data?.is_owner || false)
      } catch (err) {
        if (!fetchState.cancelled) console.error('[Auth] profile fetch failed:', err)
      } finally {
        if (!fetchState.cancelled) setProfileLoading(false)
      }
    }

    fetchProfile()

    return () => { fetchState.cancelled = true }
  }, [user?.id])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    setIsAdmin(false)
    setIsOwner(false)
    await supabase.auth.signOut()
  }

  const value = { user, session, loading, profileLoading, isAdmin, isOwner, signIn, signOut }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
