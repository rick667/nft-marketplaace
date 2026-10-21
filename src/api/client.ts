import axios, { type AxiosError } from 'axios'
import type { ApiErrorBody } from './contracts'

const sessionStorageKey = 'kurio-auth-session'
const guestStorageKey = 'kurio-guest-id'

export const apiClient = axios.create({ baseURL: '/api', timeout: 15_000 })

export function getGuestId(): string {
  let id = localStorage.getItem(guestStorageKey)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(guestStorageKey, id)
  }
  return id
}

export function readSessionToken(): string | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(sessionStorageKey) ?? 'null')
    if (value && typeof value === 'object' && 'token' in value && typeof value.token === 'string') return value.token
  } catch {
    return undefined
  }
  return undefined
}

apiClient.interceptors.request.use((config) => {
  const token = readSessionToken()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  config.headers.set('X-Guest-Id', getGuestId())
  return config
})

export function isApiError(reason: unknown): reason is AxiosError<ApiErrorBody> {
  return axios.isAxiosError<ApiErrorBody>(reason)
}

export function apiErrorStatus(reason: unknown): number | undefined {
  return isApiError(reason) ? reason.response?.status : undefined
}

export function apiErrorCode(reason: unknown): string | undefined {
  return isApiError(reason) ? reason.response?.data?.code : undefined
}

export function apiErrorMessage(reason: unknown, fallback = 'Não foi possível concluir a operação.'): string {
  if (isApiError(reason)) {
    if (!reason.response) return 'Sem conexão com o servidor. Verifique sua rede e tente novamente.'
    return reason.response.data?.message ?? fallback
  }
  return reason instanceof Error ? reason.message : fallback
}

export function isTransientError(reason: unknown): boolean {
  if (!isApiError(reason)) return false
  const status = reason.response?.status
  return !reason.response || status === 408 || status === 429 || (status !== undefined && status >= 500)
}
