import { authSessionStorageKey, type AuthSession } from '../auth/auth'
import { loadDb } from './db'

export function readMockSession(): AuthSession | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(authSessionStorageKey) ?? 'null')
    if (!value || typeof value !== 'object') return undefined
    const session = value as Partial<AuthSession>
    if (
      typeof session.token !== 'string' ||
      typeof session.expiresAt !== 'number' ||
      !session.user ||
      typeof session.user !== 'object' ||
      typeof session.user.id !== 'string' ||
      typeof session.user.email !== 'string' ||
      typeof session.user.username !== 'string' ||
      typeof session.user.createdAt !== 'string'
    ) return undefined
    // O servidor simulado só recusa a sessão; quem limpa o armazenamento do cliente é o próprio cliente.
    if (session.expiresAt <= Date.now() || loadDb().revokedTokens.includes(session.token)) return undefined
    return session as AuthSession
  } catch {
    return undefined
  }
}

export function sessionForRequest(request: Request): AuthSession | undefined {
  const session = readMockSession()
  if (!session) return undefined
  const header = request.headers.get('Authorization')
  return header === `Bearer ${session.token}` ? session : undefined
}
