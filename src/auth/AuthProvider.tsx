import { Suspense, lazy, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import {
  authSessionStorageKey,
  getAuthErrorMessage,
  privateStorageKey,
  readAuthSession,
  requestAuthentication,
  restoreSession,
  signOut,
  takeAuthenticationRequest,
  type AuthSession,
} from './auth'
import { AuthContext, type AuthDialogOptions } from './AuthContext'
import { mergeGuestCart } from '../api/endpoints'

const AuthModal = lazy(() => import('./AuthModal'))

type AuthDialogState = AuthDialogOptions & { error?: string }

function safeReturnPath(path?: string): string | undefined {
  return path && path.startsWith('/') && !path.startsWith('//') ? path : undefined
}

export function AuthProvider({ children }: PropsWithChildren) {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const queryClient = useQueryClient()
  const [session, setSession] = useState<AuthSession | undefined>(() => readAuthSession())
  const triggerRef = useRef<HTMLElement | undefined>(undefined)
  const [dialog, setDialog] = useState<AuthDialogState | undefined>(() => {
    const request = takeAuthenticationRequest()
    const returnTo = safeReturnPath(request?.returnTo)
    return returnTo ? { mode: 'login', returnTo, ...(request?.error ? { error: request.error } : {}) } : undefined
  })
  const previousUserId = useRef<string | undefined>(session?.user.id)
  const currentSession = useRef(session)

  useEffect(() => {
    currentSession.current = session
  }, [session])

  useEffect(() => {
    let isCurrent = true
    void restoreSession().then((restored) => {
      if (isCurrent) setSession(restored)
    }).catch((reason) => {
      if (isCurrent) {
        setSession(undefined)
        setDialog({ mode: 'login', error: getAuthErrorMessage(reason) })
      }
    })
    return () => { isCurrent = false }
  }, [])

  useEffect(() => {
    if (!session) return
    const checkExpiry = () => {
      if (readAuthSession()) return
      requestAuthentication(pathname, 'Sua sessão expirou. Entre novamente para retomar o fluxo.')
      setSession(undefined)
    }
    const timeout = window.setTimeout(checkExpiry, Math.max(0, session.expiresAt - Date.now()))
    document.addEventListener('visibilitychange', checkExpiry)
    return () => {
      window.clearTimeout(timeout)
      document.removeEventListener('visibilitychange', checkExpiry)
    }
  }, [pathname, session])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === authSessionStorageKey) {
        void restoreSession().then((restored) => {
          if (!restored && currentSession.current && /^\/(payment|order|profile|wallets)(\/|$)/.test(pathname)) {
            requestAuthentication(pathname, 'Sua sessão foi encerrada em outra aba. Entre novamente para retomar.')
          }
          setSession(restored)
        }).catch((reason) => {
          setDialog({ mode: 'login', error: getAuthErrorMessage(reason) })
          setSession(undefined)
        })
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [pathname])

  useEffect(() => {
    const currentUserId = session?.user.id
    const previousId = previousUserId.current
    if (previousId !== currentUserId) {
      queryClient.clear()
      if (previousId) localStorage.removeItem(privateStorageKey(previousId, 'wallet-session'))
      if (previousId && pathname !== '/' && /^\/(payment|order|profile|wallets)(\/|$)/.test(pathname)) {
        void navigate({ to: '/', search: { cart: false } })
      }
      window.dispatchEvent(new CustomEvent('kurio:auth-changed', {
        detail: { previousUserId: previousId, currentUserId },
      }))
      previousUserId.current = currentUserId
    }
  }, [navigate, pathname, queryClient, session?.user.id])

  useEffect(() => {
    if (!dialog) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDialog(undefined)
    }
    const previousOverflow = document.body.style.overflow
    const trigger = document.activeElement instanceof HTMLElement && !document.activeElement.closest('.auth-modal')
      ? document.activeElement
      : triggerRef.current
    triggerRef.current = trigger
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      if (trigger?.isConnected) window.setTimeout(() => trigger.focus(), 0)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [dialog])

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ returnTo?: string; error?: string }>).detail
      const returnTo = safeReturnPath(detail?.returnTo)
      if (!readAuthSession()) setSession(undefined)
      setDialog({
        mode: 'login',
        ...(returnTo ? { returnTo } : {}),
        ...(detail?.error ? { error: detail.error } : {}),
      })
    }
    window.addEventListener('kurio:request-authentication', handleRequest)
    return () => window.removeEventListener('kurio:request-authentication', handleRequest)
  }, [])

  const openAuth = useCallback((options: AuthDialogOptions = {}) => {
    setDialog({ ...options, returnTo: safeReturnPath(options.returnTo) })
  }, [])

  const closeAuth = useCallback(() => setDialog(undefined), [])

  const authenticate = useCallback((nextSession: AuthSession) => {
    setSession(nextSession)
    const currentDialog = dialog
    setDialog(undefined)
    // O carrinho do visitante passa para a conta antes de qualquer retomada de fluxo.
    void mergeGuestCart().catch(() => undefined).then(() => {
      void queryClient.invalidateQueries({ queryKey: ['cart'] })
      currentDialog?.onAuthenticated?.(nextSession)
      const returnTo = safeReturnPath(currentDialog?.returnTo)
      if (returnTo && !currentDialog?.onAuthenticated) {
        window.location.assign(returnTo)
      }
    })
  }, [dialog, queryClient])

  const logout = useCallback(async () => {
    try {
      await signOut()
      setSession(undefined)
      setDialog(undefined)
      void navigate({ to: '/', search: { cart: false } })
      return true
    } catch (reason) {
      setDialog({ mode: 'login', error: getAuthErrorMessage(reason) })
      return false
    }
  }, [navigate])

  const updateSession = useCallback((nextSession: AuthSession) => {
    setSession(nextSession)
  }, [])

  return (
    <AuthContext.Provider value={{ session, openAuth, closeAuth, logout, updateSession }}>
      {children}
      {dialog && (
        <Suspense fallback={null}>
          <AuthModal
            mode={dialog.mode ?? 'login'}
            error={dialog.error}
            onClose={closeAuth}
            onModeChange={(mode) => setDialog((current) => current ? { ...current, mode, error: undefined } : current)}
            onError={(error) => setDialog((current) => current ? { ...current, error } : current)}
            onAuthenticated={authenticate}
          />
        </Suspense>
      )}
    </AuthContext.Provider>
  )
}

