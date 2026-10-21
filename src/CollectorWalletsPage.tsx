import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import axios from 'axios'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  ArrowLeft,
  ChevronDown,
  CircleHelp,
  Download,
  Heart,
  LogOut,
  Search,
  Tag,
  UserRound,
  Wallet,
} from 'lucide-react'
import CartIcon from './assets/icons/Shop.svg'
import {
  getAuthErrorMessage,
  getCollectorProfile,
  getCollectorWallets,
  saveCollectorWallets,
  type CollectorProfile,
} from './auth/auth'
import { useAuth } from './auth/AuthContext'
import type { Network, WalletAccount } from './api/contracts'
import { useCart } from './api/hooks'
import './CollectorProfilePage.css'
import './CollectorWalletsPage.css'

type WalletForm = {
  displayName: string
  walletNickname: string
  network: string
  profileName: string
  walletAddress: string
  ens: string
  walletType: string
  referralCode: string
  email: string
  ensName: string
}

type WalletField = keyof WalletForm

const networks: Network[] = ['Ethereum', 'Polygon', 'Solana']
const providers: WalletAccount['provider'][] = ['WalletConnect', 'MetaMask', 'Coinbase Wallet']
const ensSuffixes = ['.eth', '.xyz', '.art', '.com'] as const

const emptyWalletForm = (): WalletForm => ({
  displayName: '',
  walletNickname: '',
  network: '',
  profileName: '',
  walletAddress: '',
  ens: '',
  walletType: '',
  referralCode: '',
  email: '',
  ensName: '',
})

function formFromWallet(wallet: WalletAccount | undefined, profile: CollectorProfile): WalletForm {
  return {
    displayName: wallet?.displayName ?? profile.displayName,
    walletNickname: wallet?.label ?? profile.walletNickname,
    network: wallet?.network ?? '',
    profileName: wallet?.profileName ?? profile.walletNickname,
    walletAddress: wallet?.address ?? '',
    ens: wallet?.ens ?? '',
    walletType: wallet?.provider ?? '',
    referralCode: wallet?.referralCode ?? '',
    email: wallet?.email ?? profile.email,
    ensName: wallet?.ensName ?? profile.ensName,
  }
}

function isNetwork(value: string): value is Network {
  return networks.includes(value as Network)
}

function isProvider(value: string): value is WalletAccount['provider'] {
  return providers.includes(value as WalletAccount['provider'])
}

function WalletFields({
  form,
  onChange,
  prefix,
  firstFieldRef,
}: {
  form: WalletForm
  onChange: (field: WalletField, value: string) => void
  prefix: string
  firstFieldRef?: RefObject<HTMLInputElement | null>
}) {
  const suffix = ensSuffixes.find((item) => form.ensName.toLocaleLowerCase('en-US').endsWith(item)) ?? '.eth'
  const ensLabel = form.ensName.replace(/\.(eth|xyz|art|com)$/i, '')

  const textField = (
    field: WalletField,
    label: string,
    options: { required?: boolean; type?: string; placeholder?: string; maxLength?: number; inputRef?: RefObject<HTMLInputElement | null> } = {},
  ) => (
    <label className="wallet-field" key={field}>
      <span>{label}{options.required && <b aria-hidden="true">*</b>}</span>
      <input
        ref={options.inputRef}
        id={`${prefix}-${field}`}
        name={field}
        type={options.type ?? 'text'}
        value={form[field]}
        placeholder={options.placeholder}
        maxLength={options.maxLength ?? 128}
        required={options.required}
        autoComplete={field === 'email' ? 'email' : 'off'}
        onChange={(event) => onChange(field, event.target.value)}
      />
    </label>
  )

  return (
    <div className="wallet-fields-grid">
      {textField('displayName', 'Nome de exibição', { required: true, maxLength: 60, inputRef: firstFieldRef })}
      {textField('walletNickname', 'Apelido da carteira', { required: true, maxLength: 40 })}
      <label className="wallet-field">
        <span>Rede<b aria-hidden="true">*</b></span>
        <span className="wallet-select-wrap">
          <select
            id={`${prefix}-network`}
            name="network"
            value={form.network}
            required
            onChange={(event) => onChange('network', event.target.value)}
          >
            <option value="" disabled>Selecione uma rede</option>
            {networks.map((network) => <option key={network}>{network}</option>)}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </span>
      </label>
      {textField('profileName', 'Nome do perfil', { required: true, maxLength: 60 })}
      {textField('walletAddress', 'Endereço da carteira', { required: true, placeholder: 'Endereço 0x da carteira' })}
      <label className="wallet-field wallet-field-placeholder">
        <span aria-hidden="true" />
        <input
          id={`${prefix}-ens`}
          name="ens"
          value={form.ens}
          placeholder="ENS ou carteira secundária (opcional)"
          aria-label="ENS ou carteira secundária (opcional)"
          maxLength={128}
          autoComplete="off"
          onChange={(event) => onChange('ens', event.target.value)}
        />
      </label>
      <label className="wallet-field">
        <span>Tipo de carteira<b aria-hidden="true">*</b></span>
        <span className="wallet-select-wrap">
          <select
            id={`${prefix}-walletType`}
            name="walletType"
            value={form.walletType}
            required
            onChange={(event) => onChange('walletType', event.target.value)}
          >
            <option value="" disabled>Selecione uma carteira</option>
            {providers.map((provider) => <option key={provider}>{provider}</option>)}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </span>
      </label>
      {textField('referralCode', 'Código de indicação', { required: true, maxLength: 40 })}
      {textField('email', 'E-mail', { required: true, type: 'email', maxLength: 254 })}
      <label className="wallet-field">
        <span>Nome ENS<b aria-hidden="true">*</b></span>
        <span className="wallet-ens-wrap">
          <span className="wallet-ens-suffix">
            <select
              aria-label={`${prefix} extensão do nome ENS`}
              value={suffix}
              onChange={(event) => onChange('ensName', `${ensLabel}${event.target.value}`)}
            >
              {ensSuffixes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </span>
          <input
            id={`${prefix}-ensName`}
            name="ensName"
            value={ensLabel}
            required
            maxLength={60}
            autoComplete="off"
            onChange={(event) => onChange('ensName', `${event.target.value}${suffix}`)}
          />
        </span>
      </label>
    </div>
  )
}

function CollectorWalletsPage() {
  const auth = useAuth()
  const openAuth = auth.openAuth
  const primaryFirstFieldRef = useRef<HTMLInputElement>(null)
  const { count: cartCount } = useCart()
  const [profile, setProfile] = useState<CollectorProfile>(() => ({
    displayName: auth.session?.user.username ?? '',
    username: auth.session?.user.username ?? '',
    email: auth.session?.user.email ?? '',
    ensName: '',
    walletNickname: '',
    avatarDataUrl: '',
  }))
  const [wallets, setWallets] = useState<WalletAccount[]>([])
  const [primaryForm, setPrimaryForm] = useState<WalletForm>(emptyWalletForm)
  const [secondaryForm, setSecondaryForm] = useState<WalletForm>(emptyWalletForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isAddingSecondary, setIsAddingSecondary] = useState(false)
  const [sameAsPrimary, setSameAsPrimary] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const primaryWallet = wallets.find((wallet) => wallet.isPrimary)
  const secondaryWallet = wallets.find((wallet) => !wallet.isPrimary)

  useEffect(() => {
    let active = true
    void Promise.all([getCollectorProfile(), getCollectorWallets()]).then(([storedProfile, storedWallets]) => {
      if (!active) return
      setProfile(storedProfile)
      setWallets(storedWallets)
      const main = storedWallets.find((wallet) => wallet.isPrimary)
      const secondary = storedWallets.find((wallet) => !wallet.isPrimary)
      setPrimaryForm(formFromWallet(main, storedProfile))
      setSecondaryForm(formFromWallet(secondary, storedProfile))
      setSameAsPrimary(Boolean(secondary?.sameAsPrimary))
      setIsAddingSecondary(Boolean(secondary))
    }).catch((reason: unknown) => {
      if (!active) return
      if (axios.isAxiosError(reason) && reason.response?.status === 401) {
        openAuth({ mode: 'login', returnTo: '/wallets', error: getAuthErrorMessage(reason) })
      } else {
        setError(getAuthErrorMessage(reason))
      }
    }).finally(() => {
      if (active) setIsLoading(false)
    })
    return () => { active = false }
  }, [openAuth])

  const updateForm = (setForm: (updater: (current: WalletForm) => WalletForm) => void) =>
    (field: WalletField, value: string) => {
      setForm((current) => ({ ...current, [field]: value }))
      setError('')
      setNotice('')
    }

  const toWallet = (form: WalletForm, id: string, isPrimary: boolean): WalletAccount | undefined => {
    if (!isNetwork(form.network) || !isProvider(form.walletType)) return undefined
    return {
      id,
      label: form.walletNickname.trim(),
      provider: form.walletType,
      address: form.walletAddress.trim(),
      network: form.network,
      isPrimary,
      displayName: form.displayName.trim(),
      profileName: form.profileName.trim(),
      ens: form.ens.trim(),
      referralCode: form.referralCode.trim(),
      email: form.email.trim(),
      ensName: form.ensName.trim(),
    }
  }

  const submitPrimary = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setNotice('')
    const primary = toWallet(primaryForm, primaryWallet?.id ?? crypto.randomUUID(), true)
    if (!primary) {
      setError('Selecione uma rede e um tipo de carteira.')
      return
    }
    const secondary = secondaryWallet
      ? sameAsPrimary
        ? { ...primary, id: secondaryWallet.id, label: secondaryWallet.label, isPrimary: false, sameAsPrimary: true }
        : { ...secondaryWallet, isPrimary: false }
      : undefined

    setIsSaving(true)
    try {
      const saved = await saveCollectorWallets(secondary ? [primary, secondary] : [primary])
      setWallets(saved)
      setPrimaryForm(formFromWallet(saved.find((wallet) => wallet.isPrimary), profile))
      if (sameAsPrimary && secondary) {
        setSecondaryForm(formFromWallet(saved.find((wallet) => !wallet.isPrimary), profile))
      }
      setNotice('Carteira principal salva com sucesso.')
    } catch (reason) {
      if (axios.isAxiosError(reason) && reason.response?.status === 401) {
        openAuth({ mode: 'login', returnTo: '/wallets', error: getAuthErrorMessage(reason) })
      } else {
        setError(getAuthErrorMessage(reason))
      }
    } finally {
      setIsSaving(false)
    }
  }

  const submitSecondary = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setNotice('')
    const primary = primaryWallet ?? toWallet(primaryForm, crypto.randomUUID(), true)
    if (!primary) {
      setError('Salve a carteira principal antes de adicionar uma carteira secundária.')
      return
    }
    const secondary = sameAsPrimary
      ? { ...primary, id: secondaryWallet?.id ?? crypto.randomUUID(), label: secondaryForm.walletNickname.trim() || `${primary.label} (secundária)`, isPrimary: false, sameAsPrimary: true }
      : toWallet(secondaryForm, secondaryWallet?.id ?? crypto.randomUUID(), false)
    if (!secondary) {
      setError('Selecione uma rede e um tipo de carteira para a carteira secundária.')
      return
    }

    setIsSaving(true)
    try {
      const saved = await saveCollectorWallets([primary, secondary])
      setWallets(saved)
      setSecondaryForm(formFromWallet(saved.find((wallet) => !wallet.isPrimary), profile))
      setIsAddingSecondary(true)
      setNotice('Carteira secundária salva com sucesso.')
    } catch (reason) {
      if (axios.isAxiosError(reason) && reason.response?.status === 401) {
        openAuth({ mode: 'login', returnTo: '/wallets', error: getAuthErrorMessage(reason) })
      } else {
        setError(getAuthErrorMessage(reason))
      }
    } finally {
      setIsSaving(false)
    }
  }

  const setSameAsPrimaryValue = (checked: boolean) => {
    setSameAsPrimary(checked)
    if (checked) {
      setSecondaryForm(primaryWallet ? formFromWallet(primaryWallet, profile) : { ...primaryForm })
    }
    setError('')
    setNotice('')
  }

  const unavailableSection = (section: string) => {
    setError(`A seção "${section}" não faz parte desta demonstração.`)
    setNotice('')
  }

  return (
    <div className="kurio-app collector-profile-page collector-wallet-page">
      <header className="site-header">
        <Link className="wordmark" to="/" search={{ cart: false }} aria-label="Kurio início">KURIO</Link>
        <nav className="main-nav" aria-label="Navegação principal">
          <Link className="current" to="/" search={{ cart: false }}>Início</Link>
          <Link to="/" search={{ cart: false }} hash="catalogo">Mercado</Link>
          <Link to="/" search={{ cart: false }} hash="criadores">Criadores</Link>
          <Link to="/" search={{ cart: false }} hash="rodape">Aprenda</Link>
        </nav>
        <div className="header-tools">
          <Link className="header-search" to="/" search={{ cart: false }} hash="catalogo" aria-label="Buscar NFTs">
            <Search size={19} aria-hidden="true" />
          </Link>
          <Link className="icon-button" to="/profile" aria-label="Meu perfil">
            <UserRound size={19} />
          </Link>
          <Link className="icon-button cart-trigger" to="/cart" aria-label={`Abrir carrinho, ${cartCount} itens`}>
            <img src={CartIcon} alt="" />
            {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
          </Link>
          <button className="login-button" type="button" onClick={() => void auth.logout()}>
            <LogOut size={20} />Sair
          </button>
        </div>
      </header>

      <div className="collector-mobile-header">
        <Link to="/" search={{ cart: false }} aria-label="Voltar para o início"><ArrowLeft size={18} aria-hidden="true" /></Link>
        <Link className="wordmark" to="/" search={{ cart: false }} aria-label="Kurio início">KURIO</Link>
        <Link className="collector-mobile-cart" to="/cart" aria-label={`Abrir carrinho, ${cartCount} itens`}>
          <img src={CartIcon} alt="" />
          {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
        </Link>
      </div>

      <main className="collector-profile-main">
        <div className="collector-profile-layout">
          <aside className="collector-account-sidebar" aria-label="Navegação da conta">
            <h1>Meu perfil</h1>
            <nav aria-label="Seções da conta">
              <Link className="collector-account-link" to="/profile"><UserRound size={18} aria-hidden="true" /><span>Dados do perfil</span></Link>
              <Link className="collector-account-active" to="/wallets" aria-current="page"><Wallet size={20} aria-hidden="true" /><span>Carteiras</span></Link>
              <button type="button" onClick={() => unavailableSection('Atividade')}><Activity size={18} aria-hidden="true" /><span>Atividade</span></button>
              <button type="button" onClick={() => unavailableSection('Lista de interesse')}><Heart size={17} aria-hidden="true" /><span>Lista de interesse</span></button>
              <button type="button" onClick={() => unavailableSection('Ofertas')}><Tag size={18} aria-hidden="true" /><span>Ofertas</span></button>
              <button type="button" onClick={() => unavailableSection('Arquivos baixados')}><Download size={18} aria-hidden="true" /><span>Arquivos baixados</span></button>
              <button type="button" onClick={() => unavailableSection('Suporte')}><CircleHelp size={18} aria-hidden="true" /><span>Suporte</span></button>
              <button className="collector-sidebar-logout" type="button" onClick={() => void auth.logout()}>
                <LogOut size={20} aria-hidden="true" /><span>Sair</span>
              </button>
            </nav>
          </aside>

          <div className="collector-wallet-content">
            <form className="wallet-primary-form" onSubmit={(event) => void submitPrimary(event)}>
              <div className="wallet-section-heading">
                <div>
                  <h2>Carteira principal</h2>
                  <p>Estas carteiras ficam disponíveis no pagamento e para receber NFTs comprados.</p>
                </div>
                <button className="wallet-add-link" type="button" onClick={() => primaryFirstFieldRef.current?.focus()}>
                  {primaryWallet ? 'Editar' : 'Adicionar'}
                </button>
              </div>
              {isLoading ? <p className="wallet-loading" role="status">Carregando suas carteiras...</p> : (
                <>
                  <WalletFields
                    form={primaryForm}
                    onChange={updateForm(setPrimaryForm)}
                    prefix="primary-wallet"
                    firstFieldRef={primaryFirstFieldRef}
                  />
                  <button className="wallet-save-button" type="submit" disabled={isSaving}>
                    {isSaving ? 'Salvando...' : 'Salvar carteira'}
                  </button>
                </>
              )}
            </form>

            <section className="wallet-secondary-section" aria-labelledby="secondary-wallet-title">
              <div className="wallet-secondary-heading">
                <h2 id="secondary-wallet-title">Carteira secundária</h2>
                <div className="wallet-secondary-actions">
                  <label>
                    <input
                      type="checkbox"
                      checked={sameAsPrimary}
                      onChange={(event) => setSameAsPrimaryValue(event.target.checked)}
                    />
                    <span>Igual à carteira principal</span>
                  </label>
                  <button
                    className="wallet-add-link"
                    type="button"
                    onClick={() => {
                      setIsAddingSecondary(true)
                      if (!secondaryWallet && !sameAsPrimary) setSecondaryForm(emptyWalletForm())
                    }}
                  >
                    {secondaryWallet ? 'Editar' : 'Adicionar'}
                  </button>
                </div>
              </div>
              {!isAddingSecondary ? (
                <p className="wallet-empty-secondary">Você ainda não adicionou uma carteira secundária.</p>
              ) : (
                <form className="wallet-secondary-form" onSubmit={(event) => void submitSecondary(event)}>
                  {sameAsPrimary ? (
                    <p className="wallet-same-description">A carteira secundária usará os mesmos dados da carteira principal.</p>
                  ) : (
                    <WalletFields
                      form={secondaryForm}
                      onChange={updateForm(setSecondaryForm)}
                      prefix="secondary-wallet"
                    />
                  )}
                  <button className="wallet-save-button" type="submit" disabled={isSaving}>
                    {isSaving ? 'Salvando...' : 'Salvar carteira'}
                  </button>
                </form>
              )}
            </section>

            {error && <p className="profile-feedback profile-feedback-error" role="alert">{error}</p>}
            {notice && <p className="profile-feedback" role="status">{notice}</p>}
          </div>
        </div>
      </main>
    </div>
  )
}

export default CollectorWalletsPage
