import { createContext, useContext } from 'react'
import type { AuthSession } from './auth'

export type AuthMode = 'login' | 'register'

export type AuthDialogOptions = {
  mode?: AuthMode
  returnTo?: string
  onAuthenticated?: (session: AuthSession) => void
  error?: string
}

export type AuthContextValue = {
  session?: AuthSession
  openAuth: (options?: AuthDialogOptions) => void
  closeAuth: () => void
  logout: () => Promise<boolean>
  updateSession: (session: AuthSession) => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth precisa ser usado dentro de AuthProvider.')
  return value
}
