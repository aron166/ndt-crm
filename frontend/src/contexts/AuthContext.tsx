import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import api from '@/lib/api'

// Matches actual JWT payload: { sub, tenantId, iat, exp }
// Email is stored separately in localStorage at login time.
interface JwtPayload {
  sub: number
  tenantId: number
  iat: number
  exp: number
}

export interface AuthUser {
  sub: number
  tenantId: number
  email: string   // stored in localStorage at login, not in JWT
  exp: number
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const payload = token.split('.')[1]
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded) as JwtPayload
  } catch {
    return null
  }
}

function isTokenValid(payload: JwtPayload): boolean {
  return payload.exp * 1000 > Date.now()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('token')
    const storedEmail = localStorage.getItem('user-email') ?? ''
    if (stored) {
      const decoded = decodeJwtPayload(stored)
      if (decoded && isTokenValid(decoded)) {
        setToken(stored)
        setUser({ sub: decoded.sub, tenantId: decoded.tenantId, email: storedEmail, exp: decoded.exp })
      } else {
        localStorage.removeItem('token')
        localStorage.removeItem('user-email')
      }
    }
    setIsLoading(false)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ accessToken: string }>('/auth/login', { email, password })
    const accessToken = res.data.accessToken
    const decoded = decodeJwtPayload(accessToken)
    if (!decoded) throw new Error('Invalid token received')
    localStorage.setItem('token', accessToken)
    localStorage.setItem('user-email', email)
    setToken(accessToken)
    setUser({ sub: decoded.sub, tenantId: decoded.tenantId, email, exp: decoded.exp })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user-email')
    setToken(null)
    setUser(null)
    window.location.href = '/login'
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
