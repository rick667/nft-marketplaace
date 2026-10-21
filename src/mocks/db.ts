import { curatedOrder, newReleaseOrder, nfts as seedNfts } from './seed'
import type { CartItemDto, NftDto, OrderDto } from '../api/contracts'

export type MockScenario = 'default' | 'slow' | 'flaky' | 'payment-declined' | 'payment-timeout' | 'payment-hold'

export const mockScenarios: MockScenario[] = ['default', 'slow', 'flaky', 'payment-declined', 'payment-timeout', 'payment-hold']

type StoredNft = { priceEth: string; stock: number; version: number }

export type StoredOrder = OrderDto & {
  userId: string
  fingerprint: string
  settleAt: number
  hold: boolean
  plannedOutcome: 'confirmed' | 'declined'
  cartLines: CartItemDto[]
}

export type MockDb = {
  schema: 2
  scenario: MockScenario
  latencyMs: number | null
  eventSequence: number
  nfts: Record<string, StoredNft>
  favorites: Record<string, number[]>
  carts: Record<string, { items: Record<string, number>; version: number }>
  orders: Record<string, StoredOrder>
  idempotency: Record<string, { fingerprint: string; orderId: string }>
  revokedTokens: string[]
  flakyServed: string[]
  failures?: { method: string; prefix: string; status: number; remaining: number }[]
}

const storageKey = 'kurio-mock-db'

function editionSize(edition: string): number {
  const size = Number(edition.split('/')[1])
  return Number.isInteger(size) && size > 0 ? size : 10
}

export function createSeedDb(scenario: MockScenario = 'default'): MockDb {
  return {
    schema: 2,
    scenario,
    latencyMs: null,
    eventSequence: 0,
    nfts: Object.fromEntries(seedNfts.map((nft) => [
      String(nft.id),
      { priceEth: String(nft.price), stock: editionSize(nft.edition), version: 1 },
    ])),
    favorites: {},
    carts: {},
    orders: {},
    idempotency: {},
    revokedTokens: [],
    flakyServed: [],
  }
}

let cached: MockDb | undefined

export function loadDb(): MockDb {
  if (cached) return cached
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    if (value && typeof value === 'object' && (value as MockDb).schema === 2) {
      cached = value as MockDb
      return cached
    }
  } catch {
    cached = undefined
  }
  cached = createSeedDb()
  saveDb(cached)
  return cached
}

export function saveDb(db: MockDb): void {
  cached = db
  localStorage.setItem(storageKey, JSON.stringify(db))
}

export function mutateDb<T>(change: (db: MockDb) => T): T {
  const db = loadDb()
  const result = change(db)
  saveDb(db)
  return result
}

export function refreshDbFromStorage(): void {
  cached = undefined
}

export function resetMockDatabase(scenario?: MockScenario): MockDb {
  const previous = loadDb()
  const next = createSeedDb(scenario ?? previous.scenario)
  next.eventSequence = previous.eventSequence + 1000
  Object.values(next.nfts).forEach((nft) => { nft.version = next.eventSequence })
  saveDb(next)
  return next
}

export function nextEventId(db: MockDb): string {
  db.eventSequence += 1
  return `evt-${db.eventSequence}`
}

export function toNftDto(id: number): NftDto | undefined {
  const seed = seedNfts.find((nft) => nft.id === id)
  const stored = loadDb().nfts[String(id)]
  if (!seed || !stored) return undefined
  return {
    id: seed.id,
    name: seed.name,
    image: seed.image,
    priceEth: stored.priceEth,
    category: seed.category,
    edition: seed.edition,
    network: seed.network,
    creator: seed.creator,
    likes: seed.likes,
    available: stored.stock,
    maxPerOrder: Math.min(10, stored.stock),
    version: stored.version,
  }
}

export function allNftDtos(): NftDto[] {
  return seedNfts.map((nft) => toNftDto(nft.id)).filter((nft): nft is NftDto => nft !== undefined)
}

export const catalogOrders = { curated: curatedOrder, newReleases: newReleaseOrder }
