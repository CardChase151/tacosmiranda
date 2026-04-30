import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../config/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
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
  const [isAdmin, setIsAdmin] = useState(false)
  const [isOwner, setIsOwner] = useState(false)

  const checkAdmin = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('is_admin, is_owner')
      .eq('id', userId)
      .single()
    setIsAdmin(data?.is_admin || false)
    setIsOwner(data?.is_owner || false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) checkAdmin(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        checkAdmin(session.user.id)
      } else {
        setIsAdmin(false)
        setIsOwner(false)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    setIsAdmin(false)
    setIsOwner(false)
    await supabase.auth.signOut()
  }

  const value = { user, session, loading, isAdmin, isOwner, signIn, signOut }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
