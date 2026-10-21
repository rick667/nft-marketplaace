import axios from 'axios'
import { apiClient } from '../api/client'
import type { WalletAccount } from '../api/contracts'

export type AuthUser = {
  id: string
  email: string
  username: string
  createdAt: string
}

export type AuthSession = {
  token: string
  user: AuthUser
  expiresAt: number
}

export type CollectorProfile = {
  displayName: string
  username: string
  email: string
  ensName: string
  walletNickname: string
  avatarDataUrl: string
}

export type ProfileUpdate = Omit<CollectorProfile, 'avatarDataUrl'> & {
  avatarDataUrl?: string
}

type AuthErrorResponse = {
  message: string
}

type ProfileResponse = {
  session: AuthSession
  profile: CollectorProfile
}

export const authSessionStorageKey = 'kurio-auth-session'
let pendingReturnTo: string | undefined
let pendingAuthenticationError: string | undefined
function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<AuthSession>
  return typeof session.token === 'string' &&
    typeof session.expiresAt === 'number' &&
    Boolean(session.user && typeof session.user === 'object' &&
      typeof session.user.id === 'string' &&
      typeof session.user.email === 'string' &&
      typeof session.user.username === 'string' &&
      typeof session.user.createdAt === 'string')
}

export function readAuthSession(): AuthSession | undefined {
  try {
    const raw = localStorage.getItem(authSessionStorageKey)
    if (!raw) return undefined
    const value: unknown = JSON.parse(raw)
    if (!isAuthSession(value)) {
      localStorage.removeItem(authSessionStorageKey)
      return undefined
    }
    if (value.expiresAt <= Date.now()) {
      localStorage.removeItem(authSessionStorageKey)
      localStorage.removeItem(privateStorageKey(value.user.id, 'wallet-session'))
      return undefined
    }
    return value
  } catch {
    return undefined
  }
}

export function privateStorageKey(userId: string, key: string): string {
  return `kurio:user:${encodeURIComponent(userId)}:${key}`
}

export function currentUserStorageKey(key: string): string {
  const session = readAuthSession()
  if (!session) throw new Error('Entre novamente para acessar os dados da sua conta.')
  return privateStorageKey(session.user.id, key)
}

export function requestAuthentication(returnTo: string, error?: string): void {
  pendingReturnTo = returnTo
  pendingAuthenticationError = error
  window.dispatchEvent(new CustomEvent('kurio:request-authentication', {
    detail: { returnTo, error },
  }))
}

// O servidor recusou um token que ainda parecia válido localmente: encerra a sessão e pede novo login.
export function handleRejectedSession(): void {
  if (!readAuthSession()) return
  localStorage.removeItem(authSessionStorageKey)
  requestAuthentication(`${window.location.pathname}${window.location.search}`, 'Sua sessão expirou. Entre novamente para retomar o fluxo.')
}

export function takeAuthenticationRequest(): { returnTo: string; error?: string } | undefined {
  const request = pendingReturnTo ? {
    returnTo: pendingReturnTo,
    ...(pendingAuthenticationError ? { error: pendingAuthenticationError } : {}),
  } : undefined
  pendingReturnTo = undefined
  pendingAuthenticationError = undefined
  return request
}

export async function registerAccount(username: string, email: string, password: string): Promise<AuthSession> {
  const response = await apiClient.post<AuthSession>('/auth/register', { username, email, password })
  return response.data
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const response = await apiClient.post<AuthSession>('/auth/login', { email, password })
  return response.data
}

export async function restoreSession(): Promise<AuthSession | undefined> {
  if (!readAuthSession()) return undefined
  const response = await apiClient.get<AuthSession>('/auth/session')
  return response.data
}

export async function signOut(): Promise<void> {
  await apiClient.post('/auth/logout')
}

export async function getCollectorProfile(): Promise<CollectorProfile> {
  const response = await apiClient.get<CollectorProfile>('/auth/profile')
  return response.data
}

export async function saveCollectorProfile(
  profile: ProfileUpdate,
  passwordChange?: { currentPassword: string; newPassword: string },
): Promise<ProfileResponse> {
  const response = await apiClient.patch<ProfileResponse>('/auth/profile', { ...profile, ...passwordChange })
  return response.data
}

export async function getCollectorWallets(): Promise<WalletAccount[]> {
  const response = await apiClient.get<WalletAccount[]>('/auth/wallets')
  return response.data
}

export async function saveCollectorWallets(wallets: WalletAccount[]): Promise<WalletAccount[]> {
  const response = await apiClient.put<WalletAccount[]>('/auth/wallets', { wallets })
  return response.data
}

export function getAuthErrorMessage(reason: unknown): string {
  if (axios.isAxiosError<AuthErrorResponse>(reason)) {
    return reason.response?.data.message ?? reason.message
  }
  return reason instanceof Error ? reason.message : 'NÃ£o foi possÃ­vel concluir a autenticaÃ§Ã£o.'
}
