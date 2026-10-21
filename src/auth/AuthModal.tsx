import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, X } from 'lucide-react'
import { getAuthErrorMessage, registerAccount, signIn, type AuthSession } from './auth'
import type { AuthMode } from './AuthContext'
import { Dialog, DialogContent, DialogOverlay, DialogPortal, DialogTitle } from '../components/ui/dialog'
import { demoCredentials } from './demoCredentials'
import './AuthModal.css'

export default function AuthModal({
  mode,
  error,
  onClose,
  onModeChange,
  onError,
  onAuthenticated,
}: {
  mode: AuthMode
  error?: string
  onClose: () => void
  onModeChange: (mode: AuthMode) => void
  onError: (message: string) => void
  onAuthenticated: (session: AuthSession) => void
}) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState(() => mode === 'login' ? demoCredentials.email : '')
  const [password, setPassword] = useState(() => mode === 'login' ? demoCredentials.password : '')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState('')

  const changeMode = (nextMode: AuthMode) => {
    setEmail(nextMode === 'login' ? demoCredentials.email : '')
    setPassword(nextMode === 'login' ? demoCredentials.password : '')
    setConfirmPassword('')
    setNotice('')
    onError('')
    onModeChange(nextMode)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onError('')
    setNotice('')
    if (mode === 'register' && password !== confirmPassword) {
      onError('As senhas não coincidem.')
      return
    }
    if (password.length < 8) {
      onError('A senha deve ter pelo menos 8 caracteres.')
      return
    }
    setIsSubmitting(true)
    try {
      const nextSession = mode === 'register'
        ? await registerAccount(username, email, password)
        : await signIn(email, password)
      onAuthenticated(nextSession)
    } catch (reason) {
      onError(getAuthErrorMessage(reason))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogPortal>
      <DialogOverlay className="auth-overlay">
      <DialogContent className={`auth-modal auth-modal-${mode}`} aria-labelledby="auth-title" aria-describedby={undefined}>
        <button className="auth-close" type="button" onClick={onClose} aria-label="Fechar autenticação"><X size={20} /></button>
        <header className="auth-modal-header">
          <div className="auth-mobile-brand" aria-hidden="true">KURIO</div>
          <div className="auth-mobile-title">{mode === 'login' ? 'Entrar' : 'Criar perfil de colecionador'}</div>
          <div className="auth-tabs" role="tablist" aria-label="Acessar ou criar conta">
            <button id="auth-login-tab" role="tab" aria-selected={mode === 'login'} type="button" onClick={() => changeMode('login')}>Entrar</button>
            <span aria-hidden="true" />
            <button id="auth-register-tab" role="tab" aria-selected={mode === 'register'} type="button" onClick={() => changeMode('register')}>Criar conta</button>
          </div>
          <DialogTitle asChild>
            <p id="auth-title">
              {mode === 'login'
                ? 'Entre para gerenciar sua carteira, coleção e perfil de criador.'
                : 'Crie seu perfil de colecionador e conecte uma carteira quando quiser.'}
            </p>
          </DialogTitle>
          {mode === 'login' && (
            <p className="auth-demo-credentials">
              Acesso de teste: <strong>{demoCredentials.email}</strong>
              <span>Senha: <strong>{demoCredentials.password}</strong></span>
            </p>
          )}
        </header>

        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          {mode === 'register' && (
            <input
              autoComplete="username"
              aria-label="Nome de usuário"
              placeholder="Nome de usuário"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              maxLength={40}
            />
          )}
          <input
            type="email"
            autoComplete="email"
            aria-label="E-mail"
            placeholder={mode === 'login' ? 'contato@email.com' : 'Digite seu e-mail'}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={254}
          />
          <label className="auth-password">
            <input
              type={passwordVisible ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              aria-label="Senha"
              placeholder="Senha"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={128}
              required
            />
            <button type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}>
              {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </label>
          {mode === 'register' ? (
            <label className="auth-password">
              <input
                type={passwordVisible ? 'text' : 'password'}
                autoComplete="new-password"
                aria-label="Confirmar senha"
                placeholder="Confirmar senha"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                required
              />
              <button type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}>
                {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </label>
          ) : (
            <div className="auth-forgot">
              <button type="button" onClick={() => setNotice('A redefinição de senha por e-mail não está disponível nesta demonstração.')}>Esqueceu a senha?</button>
            </div>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}
          {notice && <p className="auth-notice" role="status">{notice}</p>}
          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <div className="auth-social">
          <div className="auth-divider"><span />Ou continue com<span /></div>
          <button type="button" onClick={() => setNotice('A autenticação com Google não está disponível nesta demonstração.')}>
            <svg className="auth-social-icon auth-google-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
              <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4 6v5h6.5c3.8-3.5 6.1-8.6 6.1-14.7Z" />
              <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.5-5c-1.8 1.2-4.1 2-7 2-5.3 0-9.8-3.6-11.4-8.4H5.9v5.2C9.3 39.5 16.1 44 24 44Z" />
              <path fill="#FBBC05" d="M12.6 27.8a12 12 0 0 1 0-7.6V15H5.9a20 20 0 0 0 0 18l6.7-5.2Z" />
              <path fill="#EA4335" d="M24 11.8c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.8 29.5 4 24 4 16.1 4 9.3 8.5 5.9 15l6.7 5.2c1.6-4.8 6.1-8.4 11.4-8.4Z" />
            </svg>
            Continuar com Google
          </button>
          <button type="button" onClick={() => setNotice('A autenticação com Facebook não está disponível nesta demonstração.')}>
            <svg className="auth-social-icon auth-facebook-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="currentColor" d="M24 12a12 12 0 1 0-13.875 11.85v-8.38H7.078V12h3.047V9.356c0-3.007 1.791-4.669 4.533-4.669 1.313 0 2.686.235 2.686.235v2.953h-1.513c-1.491 0-1.956.925-1.956 1.874V12h3.328l-.532 3.47h-2.796v8.38A12.002 12.002 0 0 0 24 12Z" />
            </svg>
            Continuar com Facebook
          </button>
          <p>Use um e-mail fictício. Sua senha nunca é armazenada em texto puro.</p>
          <button type="button" className="auth-mobile-switch" onClick={() => changeMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Não tem conta? Criar conta' : 'Já tem conta? Entrar'}
          </button>
        </div>
      </DialogContent>
      </DialogOverlay>
      </DialogPortal>
    </Dialog>
  )
}
