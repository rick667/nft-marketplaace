import { http, HttpResponse } from 'msw'
import {
  authSessionStorageKey,
  privateStorageKey,
  type AuthSession,
  type AuthUser,
  type CollectorProfile,
} from '../auth/auth'
import { demoCredentials, secondDemoCredentials } from '../auth/demoCredentials'
import { mutateDb } from './db'
import { readMockSession } from './session'
import { commerceHandlers } from './handlers/index'
import type { Network, WalletAccount } from '../api/contracts'

const walletStorageKey = 'kurio-wallets'

type StoredUser = AuthUser & {
  salt: string
  passwordHash: string
}

type AuthRequest = {
  email?: unknown
  username?: unknown
  password?: unknown
  displayName?: unknown
  ensName?: unknown
  walletNickname?: unknown
  avatarDataUrl?: unknown
  currentPassword?: unknown
  newPassword?: unknown
  wallets?: unknown
}

const authUsersStorageKey = 'kurio-auth-users'
const legacyMigrationStorageKey = 'kurio-auth-legacy-migrated'
const sessionDurationMs = 8 * 60 * 60 * 1000

function readUsers(): StoredUser[] {
  const value: unknown = JSON.parse(localStorage.getItem(authUsersStorageKey) ?? '[]')
  if (!Array.isArray(value)) throw new Error('Os dados locais das contas estão inválidos.')

  return value.filter((item): item is StoredUser =>
    item &&
    typeof item === 'object' &&
    typeof item.id === 'string' &&
    typeof item.email === 'string' &&
    typeof item.username === 'string' &&
    typeof item.createdAt === 'string' &&
    typeof item.salt === 'string' &&
    typeof item.passwordHash === 'string',
  )
}

const readSession = readMockSession

function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase('en-US')
}

function profileStorageKey(userId: string): string {
  return privateStorageKey(userId, 'collector-profile-details')
}

function readCollectorProfile(session: AuthSession): CollectorProfile {
  const raw = localStorage.getItem(profileStorageKey(session.user.id))
  if (!raw) {
    return {
      displayName: session.user.username,
      username: session.user.username,
      email: session.user.email,
      ensName: '',
      walletNickname: '',
      avatarDataUrl: '',
    }
  }

  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object') {
    throw new Error('Os dados locais do perfil estão inválidos.')
  }
  const profile = value as Partial<CollectorProfile>
  return {
    displayName: typeof profile.displayName === 'string' ? profile.displayName : session.user.username,
    username: session.user.username,
    email: session.user.email,
    ensName: typeof profile.ensName === 'string' ? profile.ensName : '',
    walletNickname: typeof profile.walletNickname === 'string' ? profile.walletNickname : '',
    avatarDataUrl: typeof profile.avatarDataUrl === 'string' ? profile.avatarDataUrl : '',
  }
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const digest = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: new TextEncoder().encode(salt),
    iterations: 210_000,
    hash: 'SHA-256',
  }, key, 256)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const seedUsers = [demoCredentials, secondDemoCredentials]

async function ensureSeedUser(email: string): Promise<StoredUser | undefined> {
  const seed = seedUsers.find((candidate) => candidate.email === email)
  if (!seed) return undefined
  const users = readUsers()
  const existing = users.find((user) => user.email === seed.email)
  if (existing) return existing

  const user: StoredUser = {
    id: crypto.randomUUID(),
    email: seed.email,
    username: seed.username,
    createdAt: new Date().toISOString(),
    salt: crypto.randomUUID(),
    passwordHash: '',
  }
  user.passwordHash = await hashPassword(seed.password, user.salt)
  localStorage.setItem(authUsersStorageKey, JSON.stringify([...users, user]))
  return user
}

function migrateLegacyData(userId: string): void {
  if (localStorage.getItem(legacyMigrationStorageKey)) return

  const legacyKeys = [
    ['kurio-favorites', 'favorites'],
    ['kurio-wallets', 'kurio-wallets'],
    ['kurio-wallet-session', 'kurio-wallet-session'],
    ['kurio-collector-profile', 'collector-profile'],
    ['kurio-active-order', 'kurio-active-order'],
  ] as const
  legacyKeys.forEach(([legacyKey, scopedKey]) => {
    const legacyValue = localStorage.getItem(legacyKey)
    const scopedKeyForUser = privateStorageKey(userId, scopedKey)
    if (legacyValue && !localStorage.getItem(scopedKeyForUser)) {
      localStorage.setItem(scopedKeyForUser, legacyValue)
    }
    localStorage.removeItem(legacyKey)
  })

  for (const legacyKey of Object.keys(localStorage)) {
    if (legacyKey.startsWith('kurio-order:')) {
      const scopedKey = privateStorageKey(userId, legacyKey)
      if (!localStorage.getItem(scopedKey)) {
        const orderValue = localStorage.getItem(legacyKey)
        if (orderValue) localStorage.setItem(scopedKey, orderValue)
      }
      localStorage.removeItem(legacyKey)
    }
  }
  localStorage.setItem(legacyMigrationStorageKey, 'true')
}

function createSession(user: StoredUser): AuthSession {
  migrateLegacyData(user.id)
  const session: AuthSession = {
    token: crypto.randomUUID(),
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.createdAt,
    },
    expiresAt: Date.now() + sessionDurationMs,
  }
  localStorage.setItem(authSessionStorageKey, JSON.stringify(session))
  return session
}

function errorResponse(message: string, status: number) {
  return HttpResponse.json({ message }, { status })
}

function serverError(reason: unknown) {
  return errorResponse(
    reason instanceof Error ? reason.message : 'Não foi possível acessar a API simulada de contas.',
    500,
  )
}

function isWalletAccount(value: unknown): value is WalletAccount {
  if (!value || typeof value !== 'object') return false
  const wallet = value as Partial<WalletAccount>
  return typeof wallet.id === 'string' &&
    typeof wallet.label === 'string' &&
    ['MetaMask', 'Coinbase Wallet', 'WalletConnect'].includes(wallet.provider as string) &&
    typeof wallet.address === 'string' &&
    ['Ethereum', 'Polygon', 'Solana'].includes(wallet.network as string) &&
    typeof wallet.isPrimary === 'boolean'
}

function validateWallets(value: unknown): WalletAccount[] | string {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2 || !value.every(isWalletAccount)) {
    return 'Cadastre uma carteira principal e, opcionalmente, uma carteira secundária.'
  }

  const wallets = value as WalletAccount[]
  if (wallets.filter((wallet) => wallet.isPrimary).length !== 1) {
    return 'Mantenha exatamente uma carteira principal.'
  }

  const addresses = new Set<string>()
  const primaryWallet = wallets.find((wallet) => wallet.isPrimary)
  for (const wallet of wallets) {
    const address = wallet.address.trim()
    if (!wallet.id.trim() || !wallet.label.trim() || address.length > 128 ||
      !/^(?:0x[a-fA-F0-9]{40}|[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.(?:eth|xyz|art|com))$/i.test(address) ||
      typeof wallet.displayName !== 'string' || !wallet.displayName.trim() || wallet.displayName.length > 60 ||
      typeof wallet.profileName !== 'string' || !wallet.profileName.trim() || wallet.profileName.length > 60 ||
      typeof wallet.ens !== 'string' || wallet.ens.length > 128 ||
      typeof wallet.referralCode !== 'string' || !wallet.referralCode.trim() || wallet.referralCode.length > 40 ||
      typeof wallet.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wallet.email) || wallet.email.length > 254 ||
      typeof wallet.ensName !== 'string' || !/^.+\.(?:eth|xyz|art|com)$/i.test(wallet.ensName) || wallet.ensName.length > 64) {
      return 'Revise os campos obrigatórios da carteira, incluindo endereço, rede, tipo, e-mail e ENS.'
    }
    const normalizedAddress = address.toLocaleLowerCase('en-US')
    if (addresses.has(normalizedAddress) &&
      !(wallet.sameAsPrimary && primaryWallet &&
        wallet.address.toLocaleLowerCase('en-US') === primaryWallet.address.toLocaleLowerCase('en-US') &&
        wallet.network === primaryWallet.network && wallet.provider === primaryWallet.provider)) {
      return 'As carteiras principal e secundária precisam ter endereços diferentes, exceto quando a secundária usa os dados da principal.'
    }
    addresses.add(normalizedAddress)
  }

  return wallets
}

async function parseRequest(request: Request): Promise<AuthRequest | Response> {
  try {
    const value: unknown = await request.json()
    if (!value || typeof value !== 'object') return errorResponse('Os dados enviados não estão em um formato válido.', 400)
    return value as AuthRequest
  } catch {
    return errorResponse('Os dados enviados não estão em um formato válido.', 400)
  }
}

export const handlers = [
  http.post('/api/auth/register', async ({ request }) => {
    try {
      const body = await parseRequest(request)
      if (body instanceof Response) return body
      const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
      const username = typeof body.username === 'string' ? body.username.trim() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        !username || username.length > 40 || password.length < 8 || password.length > 128) {
        return errorResponse('Informe um e-mail válido, nome de usuário e senha com pelo menos 8 caracteres.', 400)
      }

      const users = readUsers()
      if (users.some((user) => user.email === email)) {
        return errorResponse('Este e-mail já está cadastrado. Entre ou use outro e-mail.', 409)
      }

      const user: StoredUser = {
        id: crypto.randomUUID(),
        email,
        username,
        createdAt: new Date().toISOString(),
        salt: crypto.randomUUID(),
        passwordHash: '',
      }
      user.passwordHash = await hashPassword(password, user.salt)
      localStorage.setItem(authUsersStorageKey, JSON.stringify([...users, user]))
      return HttpResponse.json(createSession(user), { status: 201 })
    } catch (reason) {
      return serverError(reason)
    }
  }),
  http.post('/api/auth/login', async ({ request }) => {
    try {
      const body = await parseRequest(request)
      if (body instanceof Response) return body
      const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
      const password = typeof body.password === 'string' ? body.password : ''
      const user = (await ensureSeedUser(email)) ?? readUsers().find((candidate) => candidate.email === email)
      if (!user || user.passwordHash !== await hashPassword(password, user.salt)) {
        return errorResponse('E-mail ou senha incorretos.', 401)
      }
      return HttpResponse.json(createSession(user))
    } catch (reason) {
      return serverError(reason)
    }
  }),
  http.get('/api/auth/session', () => {
    const session = readSession()
    return session
      ? HttpResponse.json(session)
      : errorResponse('Sua sessão expirou. Entre novamente para continuar.', 401)
  }),
  http.get('/api/auth/profile', () => {
    try {
      const session = readSession()
      if (!session) return errorResponse('Sua sessão expirou. Entre novamente para continuar.', 401)
      return HttpResponse.json(readCollectorProfile(session))
    } catch (reason) {
      return serverError(reason)
    }
  }),
  http.get('/api/auth/wallets', () => {
    try {
      const session = readSession()
      if (!session) return errorResponse('Sua sessão expirou. Entre novamente para continuar.', 401)
      const raw = localStorage.getItem(privateStorageKey(session.user.id, walletStorageKey))
      if (!raw) return HttpResponse.json([])
      const value: unknown = JSON.parse(raw)
      if (!Array.isArray(value) || !value.every(isWalletAccount)) {
        return errorResponse('Os dados locais das carteiras estão inválidos.', 500)
      }
      return HttpResponse.json(value)
    } catch (reason) {
      return serverError(reason)
    }
  }),
  http.put('/api/auth/wallets', async ({ request }) => {
    try {
      const session = readSession()
      if (!session) return errorResponse('Sua sessão expirou. Entre novamente para continuar.', 401)
      const body = await parseRequest(request)
      if (body instanceof Response) return body
      const wallets = validateWallets(body.wallets)
      if (typeof wallets === 'string') return errorResponse(wallets, 400)

      const primaryWallet = wallets.find((wallet) => wallet.isPrimary)
      if (!primaryWallet) return errorResponse('Informe uma carteira principal.', 400)
      const walletsKey = privateStorageKey(session.user.id, walletStorageKey)
      const collectorKey = privateStorageKey(session.user.id, 'collector-profile')
      const previousWallets = localStorage.getItem(walletsKey)
      const previousCollector = localStorage.getItem(collectorKey)
      let collectorDetails: Record<string, unknown> = {}
      if (previousCollector) {
        const value: unknown = JSON.parse(previousCollector)
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return errorResponse('Os dados locais do pagamento estão inválidos.', 500)
        }
        collectorDetails = value as Record<string, unknown>
      }

      try {
        localStorage.setItem(walletsKey, JSON.stringify(wallets))
        localStorage.setItem(collectorKey, JSON.stringify({
          ...collectorDetails,
          displayName: primaryWallet.displayName,
          username: typeof collectorDetails.username === 'string' ? collectorDetails.username : session.user.username,
          network: primaryWallet.network as Network,
          profileName: primaryWallet.profileName,
          walletAddress: primaryWallet.address,
          ens: primaryWallet.ens,
          walletType: primaryWallet.provider,
          referralCode: primaryWallet.referralCode,
          email: primaryWallet.email,
          ensName: primaryWallet.ensName,
        }))
      } catch (reason) {
        if (previousWallets === null) localStorage.removeItem(walletsKey)
        else localStorage.setItem(walletsKey, previousWallets)
        if (previousCollector === null) localStorage.removeItem(collectorKey)
        else localStorage.setItem(collectorKey, previousCollector)
        throw reason
      }
      return HttpResponse.json(wallets)
    } catch (reason) {
      return serverError(reason)
    }
  }),
  http.patch('/api/auth/profile', async ({ request }) => {
    try {
      const session = readSession()
      if (!session) return errorResponse('Sua sessão expirou. Entre novamente para continuar.', 401)

      const body = await parseRequest(request)
      if (body instanceof Response) return body
      const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
      const username = typeof body.username === 'string' ? body.username.trim() : ''
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
      const ensName = typeof body.ensName === 'string' ? body.ensName.trim() : ''
      const walletNickname = typeof body.walletNickname === 'string' ? body.walletNickname.trim() : ''
      const avatarDataUrl = typeof body.avatarDataUrl === 'string' ? body.avatarDataUrl : ''
      const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

      if (!displayName || displayName.length > 60 || !username || username.length > 40 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        !/^.+\.(?:eth|xyz|art|com)$/i.test(ensName) || ensName.length > 64 ||
        !walletNickname || walletNickname.length > 40) {
        return errorResponse('Revise os campos do perfil. Nome, usuário, e-mail, ENS e apelido da carteira são obrigatórios.', 400)
      }
      if (avatarDataUrl.length > 1_500_000 ||
        (avatarDataUrl && !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(avatarDataUrl))) {
        return errorResponse('A imagem do avatar deve ser PNG, JPEG, WEBP ou GIF e ter até 1 MB.', 400)
      }
      if ((currentPassword || newPassword) &&
        (!currentPassword || newPassword.length < 8 || newPassword.length > 128)) {
        return errorResponse('Informe a senha atual e uma nova senha entre 8 e 128 caracteres.', 400)
      }
      if (currentPassword && currentPassword === newPassword) {
        return errorResponse('A nova senha precisa ser diferente da senha atual.', 400)
      }

      const users = readUsers()
      const user = users.find((candidate) => candidate.id === session.user.id)
      if (!user) return errorResponse('Não foi possível localizar esta conta. Entre novamente.', 401)
      if (users.some((candidate) => candidate.id !== user.id && candidate.email === email)) {
        return errorResponse('Este e-mail já está em uso por outra conta.', 409)
      }
      if (currentPassword && user.passwordHash !== await hashPassword(currentPassword, user.salt)) {
        return errorResponse('A senha atual está incorreta.', 400)
      }

      let nextSalt = user.salt
      let nextPasswordHash = user.passwordHash
      if (newPassword) {
        nextSalt = crypto.randomUUID()
        nextPasswordHash = await hashPassword(newPassword, nextSalt)
      }

      user.username = username
      user.email = email
      user.salt = nextSalt
      user.passwordHash = nextPasswordHash

      const updatedSession: AuthSession = {
        ...session,
        user: { ...session.user, username, email },
      }
      const profile: CollectorProfile = {
        displayName,
        username,
        email,
        ensName,
        walletNickname,
        avatarDataUrl,
      }
      const collectorDetailsKey = privateStorageKey(user.id, 'collector-profile')
      const collectorDetailsRaw = localStorage.getItem(collectorDetailsKey)
      const collectorDetailsValue: unknown = collectorDetailsRaw ? JSON.parse(collectorDetailsRaw) : {}
      if (!collectorDetailsValue || typeof collectorDetailsValue !== 'object' || Array.isArray(collectorDetailsValue)) {
        throw new Error('Os dados locais do pagamento estão inválidos.')
      }
      localStorage.setItem(authUsersStorageKey, JSON.stringify(users))
      localStorage.setItem(profileStorageKey(user.id), JSON.stringify(profile))
      localStorage.setItem(collectorDetailsKey, JSON.stringify({
        ...collectorDetailsValue,
        displayName,
        username,
        email,
        ensName,
        profileName: walletNickname,
      }))
      localStorage.setItem(authSessionStorageKey, JSON.stringify(updatedSession))
      return HttpResponse.json({ session: updatedSession, profile })
    } catch (reason) {
      return serverError(reason)
    }
  }),
  http.post('/api/auth/logout', () => {
    try {
      const session = readSession()
      if (session) mutateDb((db) => { db.revokedTokens.push(session.token) })
      localStorage.removeItem(authSessionStorageKey)
      return HttpResponse.json({ message: 'Sessão encerrada.' })
    } catch (reason) {
      return serverError(reason)
    }
  }),
  ...commerceHandlers,
]
