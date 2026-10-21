import type {
  CartDto,
  CartItemDto,
  CollectorDetails,
  CouponStatus,
  Network,
  OrderDto,
  QuoteDto,
  QuoteLine,
} from '../api/contracts'
import { addEth, percentOfEth, multiplyEth, subtractEth } from '../lib/eth'
import { mutateDb, loadDb, nextEventId, toNftDto, type MockDb, type StoredOrder } from './db'
import { emitRealtime } from './socketServer'

export const maxQuantityPerNft = 10
const networkFees: Record<Network, string> = { Ethereum: '0.016', Polygon: '0.002', Solana: '0.001' }
export const validNetworks: Network[] = ['Ethereum', 'Polygon', 'Solana']

function stableHash(value: string): number {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0
  return Math.abs(hash)
}

export function normalizeCoupon(coupon: string | undefined): string {
  return (coupon ?? '').trim().toUpperCase()
}

export function couponStatusFor(coupon: string): CouponStatus {
  if (!coupon) return 'none'
  if (coupon === 'KURIO10') return 'valid'
  if (coupon === 'KURIO-OLD') return 'expired'
  return 'invalid'
}

export function mergeItems(items: CartItemDto[]): CartItemDto[] {
  const totals = new Map<number, number>()
  items.forEach(({ nftId, quantity }) => totals.set(nftId, (totals.get(nftId) ?? 0) + quantity))
  return [...totals].map(([nftId, quantity]) => ({ nftId, quantity }))
}

export function readCartDto(db: MockDb, key: string): CartDto {
  const cart = db.carts[key]
  return {
    items: Object.entries(cart?.items ?? {}).map(([id, quantity]) => ({ nftId: Number(id), quantity })),
    version: cart?.version ?? 0,
  }
}

export function writeCart(db: MockDb, key: string, items: Record<string, number>): CartDto {
  const previous = db.carts[key]
  db.carts[key] = { items, version: (previous?.version ?? 0) + 1 }
  return readCartDto(db, key)
}

export function computeQuote(items: CartItemDto[], couponInput: string | undefined, network: Network): QuoteDto {
  const coupon = normalizeCoupon(couponInput)
  const warnings: string[] = []
  const lines: QuoteLine[] = []

  mergeItems(items).forEach(({ nftId, quantity }) => {
    const nft = toNftDto(nftId)
    if (!nft || quantity <= 0) return
    const allowed = Math.max(0, Math.min(quantity, maxQuantityPerNft, nft.available))
    if (allowed < quantity) {
      warnings.push(allowed === 0
        ? `${nft.name} está esgotado e foi removido do resumo.`
        : `${nft.name} tem apenas ${allowed} unidade(s) disponível(is).`)
    }
    if (allowed === 0) return
    lines.push({
      nftId,
      name: nft.name,
      image: nft.image,
      edition: nft.edition,
      quantity: allowed,
      requestedQuantity: quantity,
      unitPriceEth: nft.priceEth,
      lineTotalEth: multiplyEth(nft.priceEth, allowed),
      available: nft.available,
    })
  })

  const couponStatus = couponStatusFor(coupon)
  const subtotalEth = addEth(...lines.map((line) => line.lineTotalEth))
  const discountEth = couponStatus === 'valid' ? percentOfEth(subtotalEth, 1000) : '0'
  const feeEth = lines.length > 0 ? networkFees[network] : '0'
  const totalEth = subtractEth(addEth(subtotalEth, feeEth), discountEth)
  const version = stableHash(JSON.stringify([
    lines.map((line) => [line.nftId, line.quantity, line.unitPriceEth, line.available]),
    couponStatus,
    network,
  ]))

  return {
    quoteId: `q-${version}`,
    version,
    lines,
    subtotalEth,
    discountEth,
    feeEth,
    totalEth,
    coupon,
    couponStatus,
    network,
    warnings,
  }
}

export function publicOrder(order: StoredOrder): OrderDto {
  const {
    userId: _userId,
    fingerprint: _fingerprint,
    settleAt: _settleAt,
    hold: _hold,
    plannedOutcome: _plannedOutcome,
    cartLines: _cartLines,
    ...rest
  } = order
  return rest
}

export function orderFingerprint(items: CartItemDto[], coupon: string, collector: CollectorDetails, walletAddress: string): string {
  return JSON.stringify([
    mergeItems(items).sort((a, b) => a.nftId - b.nftId),
    normalizeCoupon(coupon),
    collector.network,
    collector.email,
    walletAddress,
  ])
}

export function settleOrder(orderId: string, status: 'confirmed' | 'declined', reason = ''): StoredOrder | undefined {
  return mutateDb((db) => {
    const order = db.orders[orderId]
    if (!order || order.status !== 'pending') return order

    let finalStatus = status
    let failureReason = reason
    if (finalStatus === 'confirmed') {
      const unavailable = order.lines.find((line) => (db.nfts[String(line.nftId)]?.stock ?? 0) < line.quantity)
      if (unavailable) {
        finalStatus = 'declined'
        failureReason = `${unavailable.name} não tem mais unidades disponíveis.`
      }
    }
    if (finalStatus === 'declined' && !failureReason) failureReason = 'O pagamento foi recusado pela carteira.'

    if (finalStatus === 'confirmed') {
      const cart = db.carts[order.userId]
      const nextItems = { ...(cart?.items ?? {}) }
      order.lines.forEach((line) => {
        const stored = db.nfts[String(line.nftId)]
        stored.stock -= line.quantity
        stored.version += 1
        const remaining = (nextItems[String(line.nftId)] ?? 0) - line.quantity
        if (remaining > 0) nextItems[String(line.nftId)] = remaining
        else delete nextItems[String(line.nftId)]
        emitRealtime({
          eventId: nextEventId(db),
          type: 'nft.updated',
          nftId: line.nftId,
          version: stored.version,
          priceEth: stored.priceEth,
          available: stored.stock,
        })
      })
      writeCart(db, order.userId, nextItems)
      order.transactionId = `0x${stableHash(order.id).toString(16).padStart(8, '0')}${crypto.randomUUID().replaceAll('-', '').slice(0, 56)}`
      order.explorerUrl = `https://etherscan.io/tx/${order.transactionId}`
    }

    order.status = finalStatus
    order.failureReason = finalStatus === 'declined' ? failureReason : ''
    order.updatedAt = new Date().toISOString()
    order.version += 1
    emitRealtime({
      eventId: nextEventId(db),
      type: 'order.updated',
      orderId: order.id,
      userId: order.userId,
      version: order.version,
      status: order.status,
    })
    return order
  })
}

const settleTimers = new Map<string, number>()

export function scheduleSettlement(order: StoredOrder): void {
  if (order.hold || order.status !== 'pending' || settleTimers.has(order.id)) return
  const timer = window.setTimeout(() => {
    settleTimers.delete(order.id)
    settleOrder(order.id, order.plannedOutcome)
  }, Math.max(0, order.settleAt - Date.now()))
  settleTimers.set(order.id, timer)
}

export function resumePendingOrders(): void {
  Object.values(loadDb().orders).forEach((order) => scheduleSettlement(order))
}

export function clearSettlementTimers(): void {
  settleTimers.forEach((timer) => window.clearTimeout(timer))
  settleTimers.clear()
}
