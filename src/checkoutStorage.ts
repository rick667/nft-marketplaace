import { privateStorageKey, readAuthSession } from './auth/auth'
import type { WalletAccount } from './api/contracts'

export const walletStorageKey = 'kurio-wallets'
export const walletSessionStorageKey = 'kurio-wallet-session'

export function getWalletAccounts(): WalletAccount[] {
  const userId = readAuthSession()?.user.id
  if (!userId) return []

  const raw = localStorage.getItem(privateStorageKey(userId, walletStorageKey))
  if (!raw) return []
  const value: unknown = JSON.parse(raw)
  if (!Array.isArray(value)) throw new Error('Os dados locais das carteiras estão inválidos.')

  return value.map((item): WalletAccount => {
    if (
      !item || typeof item !== 'object' ||
      !('id' in item) || typeof item.id !== 'string' ||
      !('label' in item) || typeof item.label !== 'string' ||
      !('provider' in item) || !['MetaMask', 'Coinbase Wallet', 'WalletConnect'].includes(item.provider as string) ||
      !('address' in item) || typeof item.address !== 'string' ||
      !('network' in item) || !['Ethereum', 'Polygon', 'Solana'].includes(item.network as string) ||
      !('isPrimary' in item) || typeof item.isPrimary !== 'boolean'
    ) throw new Error('Uma das carteiras salvas está inválida.')
    return item as WalletAccount
  })
}
