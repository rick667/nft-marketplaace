import { io, type Socket } from 'socket.io-client'
import { authSessionStorageKey } from '../auth/auth'
import type { NftUpdatedEvent, OrderUpdatedEvent, RealtimeEvent } from './contracts'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

type EventListener = (event: RealtimeEvent) => void
type StatusListener = (status: ConnectionStatus, reconnected: boolean) => void

let socket: Socket | undefined
let status: ConnectionStatus = 'disconnected'
let hasConnectedBefore = false
const eventListeners = new Set<EventListener>()
const statusListeners = new Set<StatusListener>()

function currentToken(): string | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(authSessionStorageKey) ?? 'null')
    return value && typeof value === 'object' && 'token' in value && typeof value.token === 'string' ? value.token : undefined
  } catch {
    return undefined
  }
}

function setStatus(next: ConnectionStatus, reconnected = false): void {
  status = next
  statusListeners.forEach((listener) => listener(next, reconnected))
}

function ensureSocket(): Socket {
  if (socket) return socket
  const created = io({
    path: '/realtime',
    transports: ['websocket'],
    autoConnect: false,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    timeout: 3000,
    auth: (callback) => callback({ token: currentToken() }),
  })
  created.on('connect', () => {
    const reconnected = hasConnectedBefore
    hasConnectedBefore = true
    setStatus('connected', reconnected)
  })
  created.on('disconnect', () => setStatus('disconnected'))
  created.on('connect_error', () => setStatus('disconnected'))
  created.io.on('reconnect_attempt', () => setStatus('connecting'))
  created.on('nft.updated', (event: NftUpdatedEvent) => eventListeners.forEach((listener) => listener(event)))
  created.on('order.updated', (event: OrderUpdatedEvent) => eventListeners.forEach((listener) => listener(event)))
  socket = created
  return created
}

export function getConnectionStatus(): ConnectionStatus {
  return status
}

export function subscribeToStatus(listener: StatusListener): () => void {
  statusListeners.add(listener)
  return () => { statusListeners.delete(listener) }
}

export function subscribeToRealtime(listener: EventListener): () => void {
  eventListeners.add(listener)
  const current = ensureSocket()
  if (!current.connected && !current.active) {
    setStatus('connecting')
    current.connect()
  }
  return () => {
    eventListeners.delete(listener)
    // Adia o encerramento: o StrictMode desmonta e remonta em seguida, e reabrir no meio do handshake trava o Manager.
    window.setTimeout(() => {
      if (eventListeners.size === 0) {
        current.disconnect()
        setStatus('disconnected')
      }
    }, 50)
  }
}

// Reconecta com o token atual (login, logout ou expiração), para o servidor reisolar a sessão.
export function reconnectRealtime(): void {
  if (!socket || eventListeners.size === 0) return
  socket.disconnect()
  socket.connect()
}
