import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import axios from 'axios'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  ArrowLeft,
  ChevronDown,
  Download,
  Heart,
  LogOut,
  Search,
  Tag,
  UserRound,
  Wallet,
  X,
  CircleHelp,
  Eye,
  EyeOff,
  ImagePlus,
} from 'lucide-react'
import CartIcon from './assets/icons/Shop.svg'
import { getAuthErrorMessage, getCollectorProfile, saveCollectorProfile, type CollectorProfile } from './auth/auth'
import { useAuth } from './auth/AuthContext'
import { useCart } from './api/hooks'
import './CollectorProfilePage.css'

const emptyProfile = (username = '', email = ''): CollectorProfile => ({
  displayName: username,
  username,
  email,
  ensName: '',
  walletNickname: '',
  avatarDataUrl: '',
})

const ensSuffixes = ['.eth', '.xyz', '.art', '.com'] as const

function CollectorProfilePage() {
  const auth = useAuth()
  const openAuth = auth.openAuth
  const fileInput = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState(() => emptyProfile(auth.session?.user.username, auth.session?.user.email))
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileNotice, setProfileNotice] = useState('')
  const { count: cartCount } = useCart()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({})
  const ensSuffix = ensSuffixes.find((suffix) => profile.ensName.toLocaleLowerCase('en-US').endsWith(suffix)) ?? '.eth'
  const ensLabel = profile.ensName.replace(/\.(eth|xyz|art|com)$/i, '')

  useEffect(() => {
    let active = true
    void getCollectorProfile().then((storedProfile) => {
      if (active) setProfile(storedProfile)
    }).catch((reason: unknown) => {
      if (!active) return
      if (axios.isAxiosError(reason) && reason.response?.status === 401) {
        openAuth({ mode: 'login', returnTo: '/profile', error: getAuthErrorMessage(reason) })
      } else {
        setProfileError(getAuthErrorMessage(reason))
      }
    }).finally(() => {
      if (active) setIsLoading(false)
    })
    return () => { active = false }
  }, [openAuth])

  const updateField = (field: keyof CollectorProfile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }))
    setProfileError('')
    setProfileNotice('')
  }

  const chooseAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setProfileError('Escolha uma imagem PNG, JPEG, WEBP ou GIF.')
      return
    }
    if (file.size > 1_048_576) {
      setProfileError('A imagem do avatar deve ter até 1 MB.')
      return
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') {
        setProfileError('Não foi possível ler a imagem selecionada.')
        return
      }
      updateField('avatarDataUrl', reader.result)
    })
    reader.addEventListener('error', () => setProfileError('Não foi possível ler a imagem selecionada.'))
    reader.readAsDataURL(file)
  }

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setProfileError('')
    setProfileNotice('')
    const hasPasswordChange = Boolean(currentPassword || newPassword || confirmPassword)
    if (hasPasswordChange) {
      if (!currentPassword) {
        setProfileError('Informe sua senha atual para alterá-la.')
        return
      }
      if (newPassword.length < 8 || newPassword.length > 128) {
        setProfileError('A nova senha deve ter entre 8 e 128 caracteres.')
        return
      }
      if (newPassword !== confirmPassword) {
        setProfileError('A confirmação não corresponde à nova senha.')
        return
      }
    }

    setIsSaving(true)
    try {
      const result = await saveCollectorProfile(
        profile,
        hasPasswordChange ? { currentPassword, newPassword } : undefined,
      )
      setProfile(result.profile)
      auth.updateSession(result.session)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setProfileNotice(hasPasswordChange ? 'Perfil e senha atualizados com sucesso.' : 'Perfil atualizado com sucesso.')
    } catch (reason) {
      if (axios.isAxiosError(reason) && reason.response?.status === 401) {
        openAuth({ mode: 'login', returnTo: '/profile', error: getAuthErrorMessage(reason) })
      } else {
        setProfileError(getAuthErrorMessage(reason))
      }
    } finally {
      setIsSaving(false)
    }
  }

  const togglePasswordVisibility = (field: string) => {
    setVisiblePasswords((current) => ({ ...current, [field]: !current[field] }))
  }

  const renderPassword = (
    field: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    autoComplete: string,
  ) => (
    <label className="profile-password-field">
      <span>{label}</span>
      <span className="profile-password-input">
        <input
          type={visiblePasswords[field] ? 'text' : 'password'}
          autoComplete={autoComplete}
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={128}
        />
        <button
          type="button"
          onClick={() => togglePasswordVisibility(field)}
          aria-label={visiblePasswords[field] ? `Ocultar ${label.toLocaleLowerCase('pt-BR')}` : `Mostrar ${label.toLocaleLowerCase('pt-BR')}`}
        >
          {visiblePasswords[field] ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </span>
    </label>
  )

  const unavailableSection = (section: string) => {
    setProfileError(`A seção "${section}" não faz parte desta demonstração.`)
    setProfileNotice('')
  }

  return (
    <div className="kurio-app collector-profile-page">
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
          <Link className="icon-button" to="/profile" aria-label="Meu perfil" aria-current="page">
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
              <Link className="collector-account-active" to="/profile" aria-current="page">
                <UserRound size={18} aria-hidden="true" /><span>Dados do perfil</span>
              </Link>
              <Link className="collector-account-link" to="/wallets"><Wallet size={20} aria-hidden="true" /><span>Carteiras</span></Link>
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

          <form className="collector-profile-form" onSubmit={(event) => void submitProfile(event)}>
            <h2>Perfil do colecionador</h2>
            {isLoading ? (
              <p className="profile-loading" role="status">Carregando seus dados...</p>
            ) : (
              <>
                <div className="profile-fields-grid">
                  <label className="profile-field">
                    <span>Nome de exibição<b aria-hidden="true">*</b></span>
                    <input
                      type="text"
                      autoComplete="name"
                      value={profile.displayName}
                      onChange={(event) => updateField('displayName', event.target.value)}
                      maxLength={60}
                      required
                    />
                  </label>
                  <label className="profile-field">
                    <span>Nome de usuário<b aria-hidden="true">*</b></span>
                    <input
                      type="text"
                      autoComplete="username"
                      value={profile.username}
                      onChange={(event) => updateField('username', event.target.value)}
                      maxLength={40}
                      required
                    />
                  </label>
                  <label className="profile-field">
                    <span>E-mail<b aria-hidden="true">*</b></span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={profile.email}
                      onChange={(event) => updateField('email', event.target.value)}
                      maxLength={254}
                      required
                    />
                  </label>
                  <label className="profile-field">
                    <span>Nome ENS<b aria-hidden="true">*</b></span>
                    <div className="profile-ens-field">
                      <span className="profile-ens-suffix">
                        <select
                          aria-label="Extensão do nome ENS"
                          value={ensSuffix}
                          onChange={(event) => updateField('ensName', `${ensLabel}${event.target.value}`)}
                        >
                          {ensSuffixes.map((suffix) => <option key={suffix} value={suffix}>{suffix}</option>)}
                        </select>
                        <ChevronDown size={14} aria-hidden="true" />
                      </span>
                      <input
                        type="text"
                        autoComplete="off"
                        aria-label="Nome ENS"
                        value={ensLabel}
                        onChange={(event) => updateField('ensName', `${event.target.value}${ensSuffix}`)}
                        maxLength={60}
                        required
                      />
                    </div>
                  </label>
                  <label className="profile-field profile-field-wide">
                    <span>Apelido da carteira<b aria-hidden="true">*</b></span>
                    <input
                      type="text"
                      autoComplete="off"
                      value={profile.walletNickname}
                      onChange={(event) => updateField('walletNickname', event.target.value)}
                      maxLength={40}
                      required
                    />
                  </label>
                </div>

                <div className="profile-avatar-field">
                  <span className="profile-field-label">Avatar</span>
                  <div className="profile-avatar-controls">
                    <div className="profile-avatar-preview" aria-label="Prévia do avatar">
                      {profile.avatarDataUrl
                        ? <img src={profile.avatarDataUrl} alt="Avatar do perfil" />
                        : <ImagePlus size={24} aria-hidden="true" />}
                    </div>
                    <input
                      ref={fileInput}
                      className="profile-file-input"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      aria-label="Selecionar imagem para o avatar"
                      onChange={chooseAvatar}
                    />
                    <button className="profile-avatar-change" type="button" onClick={() => fileInput.current?.click()}>
                      Alterar
                    </button>
                    <button
                      className="profile-avatar-remove"
                      type="button"
                      disabled={!profile.avatarDataUrl}
                      onClick={() => updateField('avatarDataUrl', '')}
                    >
                      <X size={16} aria-hidden="true" />Remover
                    </button>
                  </div>
                </div>

                <section className="profile-password-section" aria-labelledby="change-password-title">
                  <h2 id="change-password-title">Alterar senha</h2>
                  {renderPassword('current', 'Senha atual', currentPassword, setCurrentPassword, 'current-password')}
                  {renderPassword('new', 'Nova senha', newPassword, setNewPassword, 'new-password')}
                  {renderPassword('confirm', 'Confirmar nova senha', confirmPassword, setConfirmPassword, 'new-password')}
                </section>

                {profileError && <p className="profile-feedback profile-feedback-error" role="alert">{profileError}</p>}
                {profileNotice && <p className="profile-feedback" role="status">{profileNotice}</p>}
                <button className="profile-save-button" type="submit" disabled={isSaving || isLoading}>
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </>
            )}
          </form>
        </div>
      </main>
    </div>
  )
}

export default CollectorProfilePage
