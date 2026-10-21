import { ws } from 'msw'
import type { RealtimeEvent } from '../api/contracts'

type Peer = {
  id: string
  userId?: string
  connected: boolean
  send: (data: string) => void
  close: () => void
}

const peers = new Set<Peer>()
const sessionStorageKey = 'kurio-auth-session'
let paused = false

function sessionForToken(token: unknown): string | undefined {
  if (typeof token !== 'string') return undefined
  try {
    const value: unknown = JSON.parse(localStorage.getItem(sessionStorageKey) ?? 'null')
    if (value && typeof value === 'object' && 'token' in value && value.token === token && 'user' in value) {
      const user = value.user as { id?: unknown }
      return typeof user.id === 'string' ? user.id : undefined
    }
  } catch {
    return undefined
  }
  return undefined
}

// O prefixo /socket.io/ é removido pelo MSW antes do casamento, por isso o caminho próprio.
const socketLink = ws.link(/\/realtime\/?(\?.*)?$/)

export const socketHandlers = [
  socketLink.addEventListener('connection', ({ client }) => {
    if (paused) {
      client.close(1013, 'Servidor de tempo real indisponível')
      return
    }
    const peer: Peer = {
      id: crypto.randomUUID(),
      connected: false,
      send: (data) => client.send(data),
      close: () => client.close(1001, 'Conexão encerrada pelo servidor'),
    }
    peers.add(peer)
    client.send(JSON.stringify({ sid: peer.id, upgrades: [], pingInterval: 20_000, pingTimeout: 20_000, maxPayload: 1_000_000 }).replace(/^/, '0'))

    const pingTimer = window.setInterval(() => client.send('2'), 20_000)
    client.addEventListener('close', () => {
      window.clearInterval(pingTimer)
      peers.delete(peer)
    })
    client.addEventListener('message', (event) => {
      const data = typeof event.data === 'string' ? event.data : ''
      if (data.startsWith('40')) {
        let auth: { token?: unknown } = {}
        try { auth = data.length > 2 ? JSON.parse(data.slice(2)) as { token?: unknown } : {} } catch { auth = {} }
        peer.userId = sessionForToken(auth.token)
        peer.connected = true
        client.send(`40${JSON.stringify({ sid: peer.id })}`)
      }
    })
  }),
]

export function emitRealtime(event: RealtimeEvent): void {
  const payload = `42${JSON.stringify([event.type, event])}`
  peers.forEach((peer) => {
    if (!peer.connected) return
    if (event.type === 'order.updated' && peer.userId !== event.userId) return
    peer.send(payload)
  })
}

export function disconnectAllSockets(): void {
  peers.forEach((peer) => peer.close())
  peers.clear()
}

export function setSocketServerPaused(value: boolean): void {
  paused = value
  if (value) disconnectAllSockets()
}

export function connectedSocketCount(): number {
  return [...peers].filter((peer) => peer.connected).length
}
