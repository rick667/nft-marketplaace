import { useEffect, useRef } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import type { NftUpdatedEvent, OrderDto, OrderUpdatedEvent, RealtimeEvent } from './contracts'
import { patchNftLists, queryKeys } from './hooks'
import { reconnectRealtime, subscribeToRealtime, subscribeToStatus } from './socket'
import { useConnectionStatus } from './useConnectionStatus'

const maxRememberedEvents = 500

function applyNftEvent(queryClient: QueryClient, event: NftUpdatedEvent): void {
  // Versões antigas ou repetidas nunca sobrescrevem um estado mais novo.
  patchNftLists(queryClient, event.nftId, (nft) =>
    event.version > nft.version
      ? { ...nft, priceEth: event.priceEth, available: event.available, version: event.version }
      : nft)
  void queryClient.invalidateQueries({ queryKey: ['cart'] })
  void queryClient.invalidateQueries({ queryKey: ['quote'] })
}

function applyOrderEvent(queryClient: QueryClient, event: OrderUpdatedEvent): void {
  const isThisOrder = (key: readonly unknown[]) => key[0] === 'orders' && key[2] === event.orderId
  queryClient.setQueriesData<OrderDto>(
    { predicate: (query) => isThisOrder(query.queryKey) },
    (current) => current && event.version > current.version
      ? { ...current, status: event.status, version: event.version }
      : current,
  )
  void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'orders' })
  if (event.status !== 'pending') {
    void queryClient.invalidateQueries({ queryKey: ['cart'] })
    void queryClient.invalidateQueries({ queryKey: queryKeys.nfts })
  }
}

export default function RealtimeBridge() {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const userId = session?.user.id
  const userIdRef = useRef(userId)
  const status = useConnectionStatus()

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  useEffect(() => {
    const seen = new Set<string>()
    const handle = (event: RealtimeEvent) => {
      if (seen.has(event.eventId)) return
      seen.add(event.eventId)
      if (seen.size > maxRememberedEvents) seen.delete(seen.values().next().value as string)
      if (event.type === 'nft.updated') {
        applyNftEvent(queryClient, event)
      } else if (event.userId === userIdRef.current) {
        applyOrderEvent(queryClient, event)
      }
    }
    const unsubscribeEvents = subscribeToRealtime(handle)
    // Depois de uma queda, o REST é a fonte de verdade: nada que aconteceu offline fica para trás.
    const unsubscribeStatus = subscribeToStatus((next, reconnected) => {
      if (next === 'connected' && reconnected) void queryClient.invalidateQueries()
    })
    return () => {
      unsubscribeStatus()
      unsubscribeEvents()
    }
  }, [queryClient])

  const connectedUserId = useRef(userId)
  useEffect(() => {
    if (connectedUserId.current === userId) return
    connectedUserId.current = userId
    reconnectRealtime()
  }, [userId])

  useEffect(() => {
    document.documentElement.dataset.realtime = status
  }, [status])

  if (status === 'connected') return null
  return (
    <div className="realtime-indicator" role="status" aria-live="polite" data-testid="realtime-indicator">
      <span aria-hidden="true" />
      {status === 'connecting' ? 'Reconectando às atualizações…' : 'Sem atualizações em tempo real'}
    </div>
  )
}
