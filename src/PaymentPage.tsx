import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, ChevronDown, LogOut, MoreVertical, Search, X } from 'lucide-react'
import CartIcon from './assets/icons/Shop.svg'
import { apiErrorCode, apiErrorMessage, apiErrorStatus, isApiError } from './api/client'
import type {
  CollectorDetails,
  Network,
  OrderDto,
  QuoteChangedBody,
  QuoteDto,
  WalletAccount,
} from './api/contracts'
import { listOrders, requestQuote } from './api/endpoints'
import { useCart, useCreateOrder, useQuote } from './api/hooks'
import { formatEth } from './lib/eth'
import { readCouponDraft, writeCouponDraft } from './checkoutDraft'
import { getWalletAccounts, walletSessionStorageKey } from './checkoutStorage'
import SiteFooter from './SiteFooter'
import './PaymentPage.css'
import { currentUserStorageKey, readAuthSession } from './auth/auth'
import { useAuth } from './auth/AuthContext'

type WalletSession = {
  walletId: string
  provider: WalletAccount['provider']
  address: string
  network: Network
  connectedAt: string
}

type Review = {
  collector: CollectorDetails
  wallet: WalletAccount
  quote: QuoteDto
  idempotencyKey: string
}

type PaymentForm = Omit<CollectorDetails, 'network' | 'walletType'> & {
  network: Network | ''
  walletType: WalletAccount['provider'] | ''
}

const providers: WalletAccount['provider'][] = ['WalletConnect', 'MetaMask', 'Coinbase Wallet']
const isWalletProvider = (value: string): value is WalletAccount['provider'] =>
  providers.includes(value as WalletAccount['provider'])
const isNetwork = (value: string): value is Network =>
  ['Ethereum', 'Polygon', 'Solana'].includes(value)
const providerOptions: { provider: WalletAccount['provider']; label: string; brands?: string }[] = [
  { provider: 'WalletConnect', label: 'Carteiras compatíveis', brands: 'MetaMask · Coinbase Wallet · WalletConnect' },
  { provider: 'MetaMask', label: 'MetaMask' },
  { provider: 'Coinbase Wallet', label: 'Coinbase Wallet' },
]
const emptyCollector = (): PaymentForm => ({
  displayName: '',
  username: '',
  network: '',
  profileName: '',
  walletAddress: '',
  ens: '',
  walletType: '',
  referralCode: '',
  email: '',
  ensName: '',
  note: '',
})

function readWalletSession(): WalletSession | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(currentUserStorageKey(walletSessionStorageKey)) ?? 'null')
    if (
      value && typeof value === 'object' &&
      'walletId' in value && typeof value.walletId === 'string' &&
      'provider' in value && providers.includes(value.provider as WalletAccount['provider']) &&
      'address' in value && typeof value.address === 'string' &&
      'network' in value && ['Ethereum', 'Polygon', 'Solana'].includes(value.network as string) &&
      'connectedAt' in value && typeof value.connectedAt === 'string'
    ) return value as WalletSession
    return undefined
  } catch {
    return undefined
  }
}

function readCollectorProfile(session?: WalletSession): PaymentForm {
  const defaults = emptyCollector()
  try {
    const value: unknown = JSON.parse(localStorage.getItem(currentUserStorageKey('collector-profile')) ?? 'null')
    if (!value || typeof value !== 'object') return {
      ...defaults,
      walletAddress: session?.address ?? defaults.walletAddress,
      walletType: session?.provider ?? defaults.walletType,
      network: session?.network ?? defaults.network,
    }
    const profile = value as Partial<CollectorDetails>
    return {
      displayName: typeof profile.displayName === 'string' ? profile.displayName : defaults.displayName,
      username: typeof profile.username === 'string' ? profile.username : defaults.username,
      network: session?.network ?? (['Ethereum', 'Polygon', 'Solana'].includes(profile.network ?? '') ? profile.network as Network : defaults.network),
      profileName: typeof profile.profileName === 'string' ? profile.profileName : defaults.profileName,
      walletAddress: session?.address ?? (typeof profile.walletAddress === 'string' ? profile.walletAddress : defaults.walletAddress),
      ens: typeof profile.ens === 'string' ? profile.ens : defaults.ens,
      walletType: session?.provider ?? (providers.includes(profile.walletType as WalletAccount['provider']) ? profile.walletType as WalletAccount['provider'] : defaults.walletType),
      referralCode: typeof profile.referralCode === 'string' ? profile.referralCode : defaults.referralCode,
      email: typeof profile.email === 'string' ? profile.email : defaults.email,
      ensName: typeof profile.ensName === 'string' ? profile.ensName : defaults.ensName,
      note: typeof profile.note === 'string' ? profile.note : defaults.note,
    }
  } catch {
    return defaults
  }
}
function PaymentPage({ backgroundOrder }: { backgroundOrder?: OrderDto } = {}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const auth = useAuth()
  const cartQuery = useCart()
  const createOrderMutation = useCreateOrder()
  const accounts = useMemo(() => getWalletAccounts(), [])
  const initialSession = backgroundOrder
    ? {
      walletId: backgroundOrder.wallet.id,
      provider: backgroundOrder.wallet.provider,
      address: backgroundOrder.wallet.address,
      network: backgroundOrder.collector.network,
      connectedAt: backgroundOrder.createdAt,
    }
    : readWalletSession()
  const initialWallet = accounts.find((wallet) => wallet.id === initialSession?.walletId)
    ?? accounts.find((wallet) => wallet.isPrimary)
    ?? accounts[0]
  const [selectedWalletId, setSelectedWalletId] = useState(initialSession?.walletId ?? initialWallet?.id ?? 'other-wallet')
  const [selectedProvider, setSelectedProvider] = useState<WalletAccount['provider'] | ''>(initialSession?.provider ?? initialWallet?.provider ?? '')
  const [walletSession, setWalletSession] = useState<WalletSession | undefined>(initialSession)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting'>('idle')
  const [collector, setCollector] = useState<PaymentForm>(() => backgroundOrder?.collector ?? readCollectorProfile(initialSession))
  const [coupon, setCoupon] = useState(() => backgroundOrder ? backgroundOrder.coupon : readCouponDraft())
  const [couponDraft, setCouponDraft] = useState(coupon)
  const [isCouponEditorOpen, setIsCouponEditorOpen] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [review, setReview] = useState<Review | undefined>()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isProfileExpanded, setIsProfileExpanded] = useState(false)
  const submitLock = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const hasSession = Boolean(auth.session)

  useEffect(() => {
    if (backgroundOrder || !hasSession) return
    const controller = new AbortController()
    listOrders(controller.signal).then((orders) => {
      const pendingOrder = orders.find((order) => order.status === 'pending')
      if (pendingOrder) void navigate({ to: '/order/$orderId', params: { orderId: pendingOrder.id } })
    }).catch(() => undefined)
    return () => controller.abort()
  }, [backgroundOrder, hasSession, navigate])

  const liveQuote = useQuote(
    { items: cartQuery.items, coupon, network: collector.network || 'Ethereum' },
    !backgroundOrder && cartQuery.isSuccess,
  )
  const summary = backgroundOrder ?? (cartQuery.items.length > 0 ? liveQuote.data : undefined)
  const displayLines = backgroundOrder
    ? backgroundOrder.lines.map((line) => ({ nftId: line.nftId, name: line.name, image: line.image, quantity: line.quantity, lineTotalEth: line.lineTotalEth }))
    : cartQuery.items.length > 0 ? liveQuote.data?.lines ?? [] : []
  const itemCount = displayLines.reduce((sum, line) => sum + line.quantity, 0)
  const totalEth = review?.quote.totalEth ?? summary?.totalEth ?? '0'
  const hasItems = displayLines.length > 0
  const selectedWallet = accounts.find((wallet) => wallet.id === selectedWalletId) ?? initialWallet
  const isConnected = Boolean(walletSession)

  const disconnectWallet = () => {
    try {
      localStorage.removeItem(currentUserStorageKey(walletSessionStorageKey))
      setWalletSession(undefined)
      setReview(undefined)
    } catch {
      setError('Não foi possível desconectar a carteira neste navegador.')
    }
  }

  const selectAccount = (wallet: WalletAccount) => {
    setSelectedWalletId(wallet.id)
    setSelectedProvider(wallet.provider)
    setCollector((current) => ({
      ...current,
      displayName: wallet.displayName ?? current.displayName,
      network: wallet.network,
      profileName: wallet.profileName ?? current.profileName,
      walletAddress: wallet.address,
      ens: wallet.ens ?? current.ens,
      walletType: wallet.provider,
      referralCode: wallet.referralCode ?? current.referralCode,
      email: wallet.email ?? current.email,
      ensName: wallet.ensName ?? current.ensName,
    }))
    if (walletSession && walletSession.walletId !== wallet.id) disconnectWallet()
    setReview(undefined)
  }

  const selectProvider = (provider: WalletAccount['provider']) => {
    setSelectedProvider(provider)
    setCollector((current) => ({ ...current, walletType: provider }))
    setReview(undefined)
    if (walletSession && walletSession.provider !== provider) disconnectWallet()
  }

  const updateCollector = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.currentTarget
    const nextCollector = { ...collector, [name]: value }
    setCollector(nextCollector)
    try {
      localStorage.setItem(currentUserStorageKey('collector-profile'), JSON.stringify(nextCollector))
    } catch {
      setError('Não foi possível salvar os dados do colecionador neste navegador.')
    }
    if (name === 'walletType') {
      if (isWalletProvider(value)) {
        const provider = value
        setSelectedProvider(provider)
        if (walletSession && walletSession.provider !== provider) disconnectWallet()
      } else if (walletSession) {
        disconnectWallet()
      }
    }
    if (name === 'network' && walletSession) {
      if (isNetwork(value)) {
        setWalletSession((current) => {
          if (!current) return undefined
          const updated = { ...current, network: value }
          try {
            localStorage.setItem(currentUserStorageKey(walletSessionStorageKey), JSON.stringify(updated))
          } catch {
            setError('Não foi possível salvar a rede selecionada.')
          }
          return updated
        })
      } else {
        disconnectWallet()
      }
    }
    setReview(undefined)
  }

  const beginReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!readAuthSession()) {
      auth.openAuth({
        mode: 'login',
        returnTo: '/payment',
        error: 'Sua sessão expirou ou foi encerrada. Entre novamente para retomar o checkout.',
        onAuthenticated: () => {
          setReview(undefined)
          setWalletSession(undefined)
        },
      })
      return
    }
    if (!formRef.current?.reportValidity()) return
    if (!isWalletProvider(selectedProvider)) {
      setError('Selecione uma carteira para continuar.')
      return
    }
    if (!isNetwork(collector.network)) {
      setError('Selecione uma rede para continuar.')
      return
    }
    const selectedNetwork = collector.network
    try {
      const buildReview = async (session: WalletSession, account: WalletAccount | undefined) => {
        const nextCollector: CollectorDetails = {
          ...collector,
          walletAddress: session.address,
          walletType: session.provider,
          network: session.network,
        }
        const currentWallet: WalletAccount = {
          ...(account ?? selectedWallet),
          id: session.walletId,
          label: account?.label ?? selectedWallet?.label ?? `${session.provider} conectada`,
          address: session.address,
          network: session.network,
          provider: session.provider,
          isPrimary: account?.isPrimary ?? selectedWallet?.isPrimary ?? false,
        }
        setCollector(nextCollector)
        setWalletSession(session)
        setSelectedProvider(session.provider)
        const quote = await requestQuote({
          items: cartQuery.items,
          coupon,
          network: session.network,
        })
        if (quote.lines.length === 0) throw new Error('Seu carrinho está vazio.')
        setConnectionStatus('idle')
        setReview({ collector: nextCollector, wallet: currentWallet, quote, idempotencyKey: crypto.randomUUID() })
        return quote
      }

      if (!walletSession) {
        const account = accounts.find((wallet) => wallet.id === selectedWalletId && wallet.provider === selectedProvider)
          ?? accounts.find((wallet) => wallet.provider === selectedProvider)
        const session: WalletSession = {
          walletId: account?.id ?? `demo-${selectedProvider.toLowerCase().replaceAll(' ', '-')}`,
          provider: selectedProvider,
          address: selectedWalletId === 'other-wallet'
            ? collector.walletAddress.trim()
            : (account?.address ?? collector.walletAddress.trim()) || '0xC01D00000000000000000000000000000000F00D',
          network: selectedNetwork,
          connectedAt: new Date().toISOString(),
        }
        setConnectionStatus('connecting')
        setIsSubmitting(true)
        window.setTimeout(() => {
          localStorage.setItem(currentUserStorageKey(walletSessionStorageKey), JSON.stringify(session))
          buildReview(session, account)
            .then(() => setNotice('Carteira conectada. Confira os dados e valores antes de confirmar.'))
            .catch((reason: unknown) => {
              setConnectionStatus('idle')
              setError(apiErrorMessage(reason, 'Não foi possível conectar a carteira simulada.'))
            })
            .finally(() => setIsSubmitting(false))
        }, 350)
        return
      }

      const currentSession = readWalletSession()
      if (
        !currentSession ||
        currentSession.address !== walletSession.address ||
        currentSession.provider !== selectedProvider ||
        currentSession.network !== collector.network
      ) {
        setWalletSession(undefined)
        setReview(undefined)
        setConnectionStatus('idle')
        setError('A conexão da carteira foi encerrada. Revise novamente para reconectar.')
        return
      }

      setIsSubmitting(true)
      buildReview(currentSession, accounts.find((wallet) => wallet.id === currentSession.walletId))
        .catch((reason: unknown) => setError(apiErrorMessage(reason, 'Não foi possível preparar a revisão do pedido.')))
        .finally(() => setIsSubmitting(false))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível preparar a revisão do pedido.')
    }
  }

  const applyCoupon = async () => {
    const normalized = couponDraft.trim().toUpperCase()
    if (!normalized) {
      setCouponError('Informe um código promocional.')
      return
    }
    try {
      const result = await requestQuote({ items: cartQuery.items, coupon: normalized, network: collector.network || 'Ethereum' })
      if (result.couponStatus !== 'valid') {
        setCouponError(result.couponStatus === 'expired' ? 'Este cupom expirou.' : 'Código promocional inválido.')
        return
      }
      writeCouponDraft(normalized)
      setCoupon(normalized)
      setCouponDraft(normalized)
      setCouponError('')
      setIsCouponEditorOpen(false)
      setReview(undefined)
    } catch (reason) {
      setCouponError(apiErrorMessage(reason, 'Não foi possível validar o código promocional.'))
    }
  }

  const removeCoupon = () => {
    writeCouponDraft('')
    setCoupon('')
    setCouponDraft('')
    setCouponError('')
    setReview(undefined)
  }

  const confirmOrder = async () => {
    if (submitLock.current || !review) return
    if (!readAuthSession()) {
      setReview(undefined)
      setWalletSession(undefined)
      auth.openAuth({
        mode: 'login',
        returnTo: '/payment',
        error: 'Sua sessão expirou ou foi encerrada. Entre novamente antes de enviar o pedido.',
        onAuthenticated: () => setReview(undefined),
      })
      return
    }
    submitLock.current = true
    setIsSubmitting(true)
    setError('')
    try {
      const currentSession = readWalletSession()
      if (
        !currentSession ||
        currentSession.address !== review.wallet.address ||
        currentSession.network !== review.collector.network ||
        currentSession.provider !== review.wallet.provider
      ) {
        setWalletSession(undefined)
        setReview(undefined)
        setError('A carteira foi desconectada. Conecte-a novamente para continuar.')
        return
      }

      const order = await createOrderMutation.mutateAsync({
        idempotencyKey: review.idempotencyKey,
        request: {
          items: review.quote.lines.map(({ nftId, quantity }) => ({ nftId, quantity })),
          coupon: review.quote.couponStatus === 'valid' ? review.quote.coupon : '',
          quoteVersion: review.quote.version,
          quotedTotalEth: review.quote.totalEth,
          collector: review.collector,
          wallet: review.wallet,
        },
      })
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void navigate({ to: '/order/$orderId', params: { orderId: order.id } })
    } catch (reason) {
      const code = apiErrorCode(reason)
      const status = apiErrorStatus(reason)
      if (code === 'quote_changed' && isApiError(reason)) {
        const body = reason.response?.data as QuoteChangedBody | undefined
        if (body?.details?.quote) {
          setReview({ ...review, quote: body.details.quote, idempotencyKey: crypto.randomUUID() })
          setNotice('Preço, disponibilidade, cupom ou taxas mudaram. Revise os novos valores antes de confirmar.')
        } else {
          setReview(undefined)
        }
        void queryClient.invalidateQueries({ queryKey: ['quote'] })
      } else if (code === 'availability_conflict') {
        setReview(undefined)
        setError(apiErrorMessage(reason, 'Um dos NFTs não tem mais edições suficientes disponíveis.'))
        void queryClient.invalidateQueries({ queryKey: ['quote'] })
        void queryClient.invalidateQueries({ queryKey: ['cart'] })
      } else if (status === 401) {
        setReview(undefined)
        setWalletSession(undefined)
        auth.openAuth({
          mode: 'login',
          returnTo: '/payment',
          error: 'Sua sessão expirou. Entre novamente para retomar o checkout.',
          onAuthenticated: () => setReview(undefined),
        })
      } else if (status === 504 || status === undefined || (status !== undefined && status >= 500)) {
        setError('Não recebemos a resposta do servidor. Seu pedido não foi duplicado: tente confirmar novamente com segurança.')
      } else {
        setError(apiErrorMessage(reason, 'Não foi possível registrar o pedido.'))
      }
    } finally {
      submitLock.current = false
      setIsSubmitting(false)
    }
  }

  const handleSubmitReview = (event: FormEvent<HTMLFormElement>) => {
    if (review) {
      event.preventDefault()
      void confirmOrder()
    } else {
      beginReview(event)
    }
  }

  const requestPaymentReview = () => {
    const form = formRef.current
    if (!form) return
    if (window.matchMedia('(max-width: 700px)').matches && !form.checkValidity()) {
      setIsProfileExpanded(true)
      window.requestAnimationFrame(() => form.reportValidity())
      return
    }
    form.requestSubmit()
  }

  const selectOtherWallet = () => {
    setSelectedWalletId('other-wallet')
    setCollector((current) => ({ ...current, walletAddress: '', walletType: selectedProvider }))
    disconnectWallet()
  }

  return (
    <div className="kurio-app payment-page-app">
      <div className="payment-mobile-header">
        <Link to="/cart" aria-label="Voltar ao carrinho"><ArrowLeft size={21} /></Link>
        <h1>Pagamento com carteira</h1>
        <span>{itemCount}</span>
      </div>
      <header className="site-header payment-site-header">
        <Link className="wordmark" to="/" search={{ cart: false }} hash="inicio" aria-label="Kurio início">KURIO</Link>
        <nav className="main-nav" aria-label="Navegação principal">
          <Link to="/" search={{ cart: false }} hash="inicio">Início</Link>
          <Link className="current" to="/" search={{ cart: false }} hash="catalogo">Mercado</Link>
          <Link to="/" search={{ cart: false }} hash="criadores">Criadores</Link>
          <Link to="/" search={{ cart: false }} hash="rodape">Aprenda</Link>
        </nav>
        <div className="header-tools">
          <Link className="payment-header-search" to="/" search={{ cart: false }} hash="catalogo" aria-label="Buscar NFTs"><Search size={20} /></Link>
          <Link className="icon-button cart-trigger" to="/cart" aria-label={`Carrinho, ${itemCount} itens`}><img src={CartIcon} alt="" />{itemCount > 0 && <span className="cart-count">{itemCount}</span>}</Link>
          <button className="login-button" type="button" onClick={() => {
            if (auth.session) void auth.logout()
            else auth.openAuth()
          }}><LogOut size={20} /> {auth.session ? 'Sair' : 'Entrar'}</button>
        </div>
      </header>

      <main className="payment-main">
        <nav className="payment-breadcrumb" aria-label="Caminho da página">
          <Link to="/" search={{ cart: false }} hash="inicio">Início</Link><span>/</span>
          <Link to="/" search={{ cart: false }} hash="catalogo">Mercado</Link><span>/</span>
          <span aria-current="page">Pagamento</span>
        </nav>

        <div className="payment-layout">
          <section className={`payment-profile ${isProfileExpanded ? 'is-expanded' : ''}`} aria-labelledby="payment-profile-title">
            <h2 id="payment-profile-title">Perfil do colecionador</h2>
            <button
              className="payment-profile-toggle"
              type="button"
              aria-expanded={isProfileExpanded}
              aria-controls="payment-profile-form"
              onClick={() => setIsProfileExpanded((expanded) => !expanded)}
            >
              <span>Dados do colecionador</span><ChevronDown size={18} aria-hidden="true" />
            </button>
            <form id="payment-profile-form" ref={formRef} onSubmit={handleSubmitReview}>
              <div className="payment-fields">
                <label><span className="payment-field-title">Nome de exibição<span className="payment-required">*</span></span><input name="displayName" value={collector.displayName} onChange={updateCollector} required autoComplete="name" /></label>
                <label><span className="payment-field-title">Nome de usuário<span className="payment-required">*</span></span><input name="username" value={collector.username} onChange={updateCollector} required autoComplete="username" /></label>
                <label><span className="payment-field-title">Rede<span className="payment-required">*</span></span><select name="network" value={collector.network} onChange={updateCollector} required><option value="" disabled>Selecione uma rede</option><option>Ethereum</option><option>Polygon</option><option>Solana</option></select></label>
                <label><span className="payment-field-title">Nome do perfil<span className="payment-required">*</span></span><input name="profileName" value={collector.profileName} onChange={updateCollector} required /></label>
                <label><span className="payment-field-title">Endereço da carteira<span className="payment-required">*</span></span><input name="walletAddress" value={collector.walletAddress} onChange={updateCollector} placeholder="Endereço 0x da carteira" required={selectedWalletId === 'other-wallet'} /></label>
                <label><span className="payment-field-title">ENS ou carteira secundária (opcional)</span><input name="ens" value={collector.ens} onChange={updateCollector} placeholder="nome.eth ou 0x..." /></label>
                <label><span className="payment-field-title">Tipo de carteira<span className="payment-required">*</span></span><select name="walletType" value={collector.walletType} onChange={updateCollector} required><option value="" disabled>Selecione uma carteira</option>{providers.map((provider) => <option key={provider}>{provider}</option>)}</select></label>
                <label><span className="payment-field-title">Código de indicação<span className="payment-required">*</span></span><input name="referralCode" value={collector.referralCode} onChange={updateCollector} required /></label>
                <label><span className="payment-field-title">E-mail<span className="payment-required">*</span></span><input name="email" type="email" value={collector.email} onChange={updateCollector} required autoComplete="email" /></label>
                <label>
                  <span className="payment-field-title">Nome ENS<span className="payment-required">*</span></span>
                  <span className="payment-ens-input"><input name="ensName" value={collector.ensName} onChange={updateCollector} required /><span>.eth <ChevronDown size={14} /></span></span>
                </label>
              </div>
              <label className="payment-other-wallet"><input type="checkbox" checked={selectedWalletId === 'other-wallet'} onChange={(event) => {
                if (event.currentTarget.checked) {
                  setSelectedWalletId('other-wallet')
                  setCollector((current) => ({ ...current, walletAddress: '', walletType: selectedProvider }))
                  disconnectWallet()
                } else if (initialWallet) selectAccount(initialWallet)
                else setSelectedWalletId('other-wallet')
              }} /><span>Usar outra carteira?</span></label>
              <label className="payment-note"><span>Observação do colecionador (opcional)</span><textarea name="note" value={collector.note} onChange={updateCollector} /></label>
              {review && (
                <div className="payment-review" aria-live="polite">
                  <div className="payment-review-heading"><Check size={18} /><strong>Revise seus dados e valores</strong></div>
                  <p>{review.collector.displayName} · {review.collector.email}</p>
                  <p>{review.wallet.provider} · {review.wallet.address} · {review.collector.network}</p>
                  <p>{review.quote.lines.length} NFTs · subtotal {formatEth(review.quote.subtotalEth, 2)} ETH · desconto −{formatEth(review.quote.discountEth, 2)} ETH · taxa {formatEth(review.quote.feeEth, 3)} ETH</p>
                  <strong>Total: {formatEth(review.quote.totalEth, 3)} ETH</strong>
                  <button type="button" className="payment-edit-review" onClick={() => setReview(undefined)}>Editar dados antes de enviar</button>
                </div>
              )}
              {error && <p className="payment-error" role="alert">{error}</p>}
            </form>
          </section>

          <aside className="payment-sidebar">
            <section className="payment-order-summary" aria-label="Resumo do pedido">
              <h2>Seus NFTs</h2>
              <div className="payment-order-header"><strong>NFTs</strong><strong>Subtotal</strong></div>
              <div className="payment-order-items">
                {displayLines.map((line) => (
                  <article className="payment-order-item" key={line.nftId}>
                    <img src={line.image} alt={line.name} />
                    <div><h3>{line.name}</h3><span>ID do token: #{String(line.nftId).padStart(4, '0')}</span></div>
                    <span className="payment-order-quantity">(x {line.quantity})</span>
                    <strong>{formatEth(line.lineTotalEth, 2)} ETH</strong>
                  </article>
                ))}
              </div>
              <div className="payment-coupon-summary">
                <div className="payment-coupon">
                  {coupon ? (
                    <p className="payment-coupon-note">
                      Cupom {coupon} aplicado.
                      <button type="button" onClick={removeCoupon}>Remover</button>
                    </p>
                  ) : (
                    <>
                      <button
                        className="payment-coupon-note"
                        type="button"
                        aria-expanded={isCouponEditorOpen}
                        onClick={() => { setIsCouponEditorOpen((open) => !open); setCouponError('') }}
                      >
                        Tem um código promocional? Aplique aqui
                      </button>
                      {isCouponEditorOpen && (
                        <div className="payment-coupon-entry">
                          <input
                            aria-label="Código promocional"
                            value={couponDraft}
                            onChange={(event) => { setCouponDraft(event.currentTarget.value); setCouponError('') }}
                            placeholder="Digite seu código"
                          />
                          <button type="button" onClick={() => void applyCoupon()}>Aplicar</button>
                        </div>
                      )}
                    </>
                  )}
                  {couponError && <p className="payment-coupon-error" role="alert">{couponError}</p>}
                </div>
                <div className="payment-costs">
                  <p><span>Subtotal</span><b>{formatEth(summary?.subtotalEth ?? '0', 2)} ETH</b></p>
                  <p><span>{coupon ? `Desconto ${coupon}` : 'Desconto do lançamento'}</span><b>(-) {formatEth(summary?.discountEth ?? '0', 2)} ETH</b></p>
                  <p className="payment-fee"><span>Taxa de rede</span><b>{collector.network ? `${formatEth(summary?.feeEth ?? '0', 3)} ETH` : '—'}</b><small>Taxa estimada</small></p>
                  <hr />
                  <p className="payment-grand-total"><span>Total</span><b>{formatEth(totalEth, 3)} ETH</b></p>
                </div>
              </div>
            </section>

            <section className="payment-wallets" aria-label="Carteira e rede">
              <h2>Carteira e rede</h2>
              {accounts.length > 0 && (
                <label className="payment-saved-wallet">
                  <span>Carteira cadastrada</span>
                  <select
                    aria-label="Carteira cadastrada"
                    value={accounts.some((wallet) => wallet.id === selectedWalletId) ? selectedWalletId : 'other-wallet'}
                    onChange={(event) => {
                      if (event.target.value === 'other-wallet') {
                        selectOtherWallet()
                        return
                      }
                      const wallet = accounts.find((item) => item.id === event.target.value)
                      if (wallet) selectAccount(wallet)
                    }}
                  >
                    {accounts.map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>
                        {wallet.label} · {wallet.address}
                      </option>
                    ))}
                    <option value="other-wallet">Usar outra carteira</option>
                  </select>
                </label>
              )}
              {accounts.length > 0 && (
                <div className="payment-saved-wallet-list" role="group" aria-label="Carteiras cadastradas">
                  {accounts.map((wallet) => (
                    <button
                      type="button"
                      key={wallet.id}
                      aria-pressed={selectedWalletId === wallet.id}
                      className={`payment-saved-wallet-card ${selectedWalletId === wallet.id ? 'selected' : ''}`}
                      onClick={() => selectAccount(wallet)}
                    >
                      <span className="payment-radio" aria-hidden="true" />
                      <span className="payment-saved-wallet-info">
                        <strong>{wallet.label}</strong>
                        <span>{wallet.ens || wallet.address}</span>
                        <span>Rede {wallet.network}</span>
                      </span>
                      <MoreVertical size={18} aria-hidden="true" />
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-pressed={selectedWalletId === 'other-wallet'}
                    className={`payment-saved-wallet-card ${selectedWalletId === 'other-wallet' ? 'selected' : ''}`}
                    onClick={selectOtherWallet}
                  >
                    <span className="payment-radio" aria-hidden="true" />
                    <span className="payment-saved-wallet-info">
                      <strong>Usar outra carteira</strong>
                      <span>Conectar manualmente</span>
                    </span>
                  </button>
                </div>
              )}
              <div className="payment-provider-list" role="group" aria-label="Carteira para pagamento">
                {providerOptions.map(({ provider, label, brands }) => (
                  <button
                    type="button"
                    aria-pressed={selectedProvider === provider}
                    className={`payment-provider ${selectedProvider === provider ? 'selected' : ''}`}
                    key={provider}
                    onClick={() => selectProvider(provider)}
                    aria-label={brands ? `${label}: ${brands}` : label}
                  >
                    <span className="payment-radio" aria-hidden="true" />
                    <span className="payment-provider-icon" aria-hidden="true">{provider === 'Coinbase Wallet' ? 'C' : provider[0]}</span>
                    <span className="payment-provider-label">{provider}</span>
                    {brands && <span className="payment-wallet-brands">{brands}</span>}
                  </button>
                ))}
              </div>
              <div className="payment-connection-actions">
                <p className={`payment-connection-state ${connectionStatus === 'connecting' ? 'connecting' : ''}`} aria-live="polite">
                  <span className="payment-status-dot" />
                  {connectionStatus === 'connecting'
                    ? `Conectando ${selectedProvider}...`
                    : isConnected
                      ? `Carteira conectada: ${walletSession?.provider}`
                      : 'Conecte sua carteira ao revisar o pedido'}
                </p>
              </div>
              <button
                className="button button-primary payment-submit-desktop"
                type="button"
                disabled={isSubmitting || connectionStatus === 'connecting' || !hasItems}
                onClick={() => {
                  if (review) void confirmOrder()
                  else requestPaymentReview()
                }}
              >
                {connectionStatus === 'connecting' ? 'Conectando carteira...' : review ? 'Confirmar pedido' : 'Revisar pedido'}
              </button>
            </section>
          </aside>
        </div>
      </main>

      <SiteFooter onNotice={setNotice} />
      <div className="payment-mobile-checkout">
        <div><span>Total:</span><strong>{formatEth(totalEth, 3)} ETH</strong></div>
        <button className="button button-primary" type="button" disabled={isSubmitting || connectionStatus === 'connecting' || !hasItems} onClick={() => {
          if (review) void confirmOrder()
          else requestPaymentReview()
        }}>{connectionStatus === 'connecting' ? 'Conectando carteira...' : review ? 'Confirmar compra' : 'Revisar e continuar'}</button>
      </div>
      {notice && <div className="toast payment-toast" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Fechar mensagem"><X size={16} /></button></div>}
    </div>
  )
}

export default PaymentPage
