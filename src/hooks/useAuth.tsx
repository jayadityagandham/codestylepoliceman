'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

interface User {
  id: string
  email: string
  name: string
  avatar_url?: string
  github_username?: string
  discord_username?: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ error?: string }>
  register: (name: string, email: string, password: string) => Promise<{ error?: string }>
  logout: () => void
  setTokenAndUser: (token: string, user: User) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('token')
    return null
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setLoading(false); return }

    let cancelled = false
    const verify = async (retries = 2): Promise<void> => {
      try {
        const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        if (cancelled) return

        if (r.status === 401) {
          // Token expired or invalid — clear it
          localStorage.removeItem('token')
          setToken(null)
          setLoading(false)
          return
        }

        if (!r.ok) {
          // Transient server error — retry
          if (retries > 0) {
            await new Promise((res) => setTimeout(res, 500))
            return verify(retries - 1)
          }
          // Exhausted retries — keep token, stop loading so UI isn't stuck
          setLoading(false)
          return
        }

        const data = await r.json()
        if (!cancelled && data?.user) setUser(data.user)
        setLoading(false)
      } catch {
        // Network error (e.g. dev server restarting) — retry
        if (retries > 0) {
          await new Promise((res) => setTimeout(res, 500))
          return verify(retries - 1)
        }
        // Exhausted retries — keep token, stop loading
        setLoading(false)
      }
    }

    verify()
    return () => { cancelled = true }
  }, [token])

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error }
    setToken(data.token)
    setUser(data.user)
    localStorage.setItem('token', data.token)
    return {}
  }

  const register = async (name: string, email: string, password: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error }
    setToken(data.token)
    setUser(data.user)
    localStorage.setItem('token', data.token)
    return {}
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('token')
  }

  const setTokenAndUser = (t: string, u: User) => {
    setToken(t)
    setUser(u)
    localStorage.setItem('token', t)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, setTokenAndUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
