import { lazy, Suspense, useEffect, useState } from 'react'
import { Outlet } from '@tanstack/react-router'
import { AuthProvider } from './AuthProvider'

const RealtimeBridge = lazy(() => import('../api/RealtimeBridge'))

// O tempo real não é necessário para a primeira pintura: conecta quando o navegador estiver ocioso.
function useAfterIdle(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const start = () => setReady(true)
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(start, { timeout: 4000 })
      return () => window.cancelIdleCallback(id)
    }
    const timer = window.setTimeout(start, 1500)
    return () => window.clearTimeout(timer)
  }, [])
  return ready
}

export default function RootLayout() {
  const realtimeReady = useAfterIdle()
  return (
    <AuthProvider>
      {realtimeReady && <Suspense fallback={null}><RealtimeBridge /></Suspense>}
      <Outlet />
    </AuthProvider>
  )
}
