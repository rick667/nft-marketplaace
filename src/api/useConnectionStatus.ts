import { useSyncExternalStore } from 'react'
import { getConnectionStatus, subscribeToStatus, type ConnectionStatus } from './socket'

export function useConnectionStatus(): ConnectionStatus {
  return useSyncExternalStore(subscribeToStatus, getConnectionStatus, getConnectionStatus)
}
