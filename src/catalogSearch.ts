import type { Network, NftSort, NftTab } from './api/contracts'

export const catalogPageSize = 6
export const priceRange = { min: 0.02, max: 12.3 } as const

export type CatalogSearch = {
  cart: boolean
  q?: string
  category?: string
  network?: Network
  maxPrice?: number
  sort?: NftSort
  tab?: NftTab
  page?: number
}

const sorts: NftSort[] = ['recent', 'price-asc', 'price-desc', 'popular']
const tabs: NftTab[] = ['all', 'new', 'trending', 'favorites']
const networks: Network[] = ['Ethereum', 'Polygon', 'Solana']

function text(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined
}

// Valores padrão ficam de fora para manter a URL limpa e compartilhável.
export function validateCatalogSearch(search: Record<string, unknown>): CatalogSearch {
  const maxPrice = Number(search.maxPrice)
  const page = Number(search.page)
  const sort = sorts.find((item) => item === search.sort)
  const tab = tabs.find((item) => item === search.tab)
  return {
    cart: search.cart === true,
    ...(text(search.q, 80) ? { q: text(search.q, 80) } : {}),
    ...(text(search.category, 40) ? { category: text(search.category, 40) } : {}),
    ...(networks.find((item) => item === search.network) ? { network: search.network as Network } : {}),
    ...(Number.isFinite(maxPrice) && maxPrice >= priceRange.min && maxPrice < priceRange.max ? { maxPrice } : {}),
    ...(sort && sort !== 'recent' ? { sort } : {}),
    ...(tab && tab !== 'all' ? { tab } : {}),
    ...(Number.isInteger(page) && page > 1 ? { page } : {}),
  }
}

export const tabLabels: Record<NftTab, string> = {
  all: 'Todos os NFTs',
  new: 'Novos lançamentos',
  trending: 'Em alta',
  favorites: 'Favoritos',
}
