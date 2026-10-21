import { delay, http, HttpResponse } from 'msw'
import type {
  CartItemDto,
  CollectorDetails,
  CreateOrderRequest,
  NftListResponse,
  NftSort,
  NftTab,
  Network,
  OrderLine,
  RealtimeEvent,
  WalletAccount,
} from '../../api/contracts'
import { compareEth } from '../../lib/eth'
import { curatedOrder, newReleaseOrder } from '../seed'
import {
  allNftDtos,
  loadDb,
  mockScenarios,
  mutateDb,
  nextEventId,
  resetMockDatabase,
  toNftDto,
  type MockScenario,
  type StoredOrder,
} from '../db'
import { sessionForRequest } from '../session'
import {
  clearSettlementTimers,
  computeQuote,
  couponStatusFor,
  maxQuantityPerNft,
  normalizeCoupon,
  orderFingerprint,
  publicOrder,
  readCartDto,
  scheduleSettlement,
  settleOrder,
  validNetworks,
  writeCart,
  mergeItems,
} from '../commerce'
import { connectedSocketCount, disconnectAllSockets, emitRealtime, setSocketServerPaused } from '../socketServer'

const sessionMessage = 'Sua sessão expirou. Entre novamente para continuar.'
const settleDelayMs = 3000

function fail(status: number, code: string, message: string, extra: { fieldErrors?: Record<string, string>; details?: unknown } = {}) {
  return HttpResponse.json({ code, message, ...extra }, { status })
}

function unauthorized() {
  return fail(401, 'unauthorized', sessionMessage)
}

function ownerKey(request: Request): string {
  const session = sessionForRequest(request)
  if (session) return session.user.id
  return `guest:${request.headers.get('X-Guest-Id') ?? 'anonymous'}`
}

async function gate(request: Request): Promise<Response | undefined> {
  const db = loadDb()
  const latency = db.latencyMs ?? (db.scenario === 'slow' ? 1500 : 0)
  if (latency > 0) await delay(latency)
  if (db.scenario === 'flaky' && request.method === 'GET') {
    const key = `${request.method} ${new URL(request.url).pathname}`
    if (!db.flakyServed.includes(key)) {
      mutateDb((state) => { state.flakyServed.push(key) })
      return fail(503, 'service_unavailable', 'Serviço temporariamente indisponível. Tente novamente.')
    }
  }
  // Falhas pontuais programadas por testes e demonstrações (POST /api/__mock/fail).
  const pathname = new URL(request.url).pathname
  const planned = db.failures?.find((failure) =>
    failure.remaining > 0 && failure.method === request.method && pathname.startsWith(failure.prefix))
  if (planned && !pathname.startsWith('/api/__mock')) {
    mutateDb((state) => {
      const target = state.failures?.find((failure) => failure === planned || (failure.prefix === planned.prefix && failure.method === planned.method && failure.remaining > 0))
      if (target) target.remaining -= 1
    })
    return fail(planned.status, 'injected_failure', 'Falha simulada. Tente novamente.')
  }
  // Um token enviado mas inválido ou revogado nunca deve virar visitante em silêncio.
  if (request.headers.get('Authorization') && !sessionForRequest(request) && !new URL(request.url).pathname.startsWith('/api/__mock')) {
    return unauthorized()
  }
  return undefined
}

function parseId(value: string | readonly string[] | undefined): number {
  const text = Array.isArray(value) ? value[0] : value
  return /^\d+$/.test(String(text)) ? Number(text) : Number.NaN
}

async function readJson(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = await request.json()
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function parseItems(value: unknown): CartItemDto[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items: CartItemDto[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return undefined
    const { nftId, quantity } = item as Record<string, unknown>
    if (!Number.isInteger(nftId) || !Number.isInteger(quantity) || (quantity as number) < 1) return undefined
    items.push({ nftId: nftId as number, quantity: quantity as number })
  }
  return items
}

function isNetwork(value: unknown): value is Network {
  return typeof value === 'string' && (validNetworks as string[]).includes(value)
}

function numberParam(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function limitFor(nftId: number): number {
  const nft = toNftDto(nftId)
  return nft ? Math.min(maxQuantityPerNft, nft.available) : 0
}

const nftHandlers = [
  http.get('/api/nfts', async ({ request }) => {
    const blocked = await gate(request)
    if (blocked) return blocked
    const params = new URL(request.url).searchParams
    const q = (params.get('q') ?? '').trim().toLocaleLowerCase('pt-BR')
    const category = params.get('category') ?? ''
    const network = params.get('network') ?? ''
    const minPrice = numberParam(params.get('minPrice'))
    const maxPrice = numberParam(params.get('maxPrice'))
    const sort = (params.get('sort') ?? 'recent') as NftSort
    const tab = (params.get('tab') ?? 'all') as NftTab
    const pageSize = Math.min(50, Math.max(1, Math.trunc(numberParam(params.get('pageSize')) ?? 6)))
    const requestedPage = Math.max(1, Math.trunc(numberParam(params.get('page')) ?? 1))

    if (!['recent', 'price-asc', 'price-desc', 'popular'].includes(sort) || !['all', 'new', 'trending', 'favorites'].includes(tab)) {
      return fail(422, 'invalid_query', 'Parâmetros de busca inválidos.')
    }

    const session = sessionForRequest(request)
    const favorites = session ? loadDb().favorites[session.user.id] ?? [] : []
    const rank = (list: number[], id: number) => list.indexOf(id)
    let items = allNftDtos()

    if (tab === 'new') items = items.filter((nft) => rank(newReleaseOrder, nft.id) < 5)
    if (tab === 'favorites') items = items.filter((nft) => favorites.includes(nft.id))
    if (q) items = items.filter((nft) => nft.name.toLocaleLowerCase('pt-BR').includes(q) || nft.creator.toLocaleLowerCase('pt-BR').includes(q))
    if (category) items = items.filter((nft) => nft.category === category)
    if (network) items = items.filter((nft) => nft.network === network)
    if (minPrice !== undefined) items = items.filter((nft) => Number(nft.priceEth) >= minPrice)
    if (maxPrice !== undefined) items = items.filter((nft) => Number(nft.priceEth) <= maxPrice)

    const orderBy = tab === 'new' ? newReleaseOrder : curatedOrder
    items.sort((a, b) => {
      if (sort === 'price-asc') return compareEth(a.priceEth, b.priceEth) || a.id - b.id
      if (sort === 'price-desc') return compareEth(b.priceEth, a.priceEth) || a.id - b.id
      if (sort === 'popular' || tab === 'trending') return b.likes - a.likes || a.id - b.id
      return rank(orderBy, a.id) - rank(orderBy, b.id)
    })

    const total = items.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const page = Math.min(requestedPage, totalPages)
    const body: NftListResponse = {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total,
      page,
      pageSize,
      totalPages,
    }
    return HttpResponse.json(body)
  }),
  http.get('/api/nfts/:id', async ({ request, params }) => {
    const blocked = await gate(request)
    if (blocked) return blocked
    const nft = toNftDto(parseId(params.id))
    return nft ? HttpResponse.json(nft) : fail(404, 'nft_not_found', 'Este NFT não foi encontrado.')
  }),
]

const favoriteHandlers = [
  http.get('/api/favorites', async ({ request }) => {
    const blocked = await gate(request)
    if (blocked) return blocked
    const session = sessionForRequest(request)
    if (!session) return unauthorized()
    return HttpResponse.json(loadDb().favorites[session.user.id] ?? [])
  }),
  http.put('/api/favorites/:id', async ({ request, params }) => {
    const blocked = await gate(request)
    if (blocked) return blocked
    const session = sessionForRequest(request)
    if (!session) return unauthorized()
    const id = parseId(params.id)
    if (!toNftDto(id)) return fail(404, 'nft_not_found', 'Este NFT não foi encontrado.')
    if (loadDb().scenario === 'flaky') {
      const key = `PUT favorite ${session.user.id}`
      if (!loadDb().flakyServed.includes(key)) {
        mutateDb((db) => { db.flakyServed.push(key) })
        return fail(503, 'service_unavailable', 'Não foi possível salvar o favorito. Tente novamente.')
      }
    }
    await delay(loadDb().latencyMs ?? 0)
    return HttpResponse.json(mutateDb((db) => {
      const current = db.favorites[session.user.id] ?? []
      db.favorites[session.user.id] = current.includes(id) ? current : [...current, id]
      return db.favorites[session.user.id]
    }))
  }),
  http.delete('/api/favorites/:id', async ({ request, params }) => {
    const blocked = await gate(request)
    if (blocked) return blocked
    const session = sessionForRequest(request)
    if (!session) return unauthorized()
    const id = parseId(params.id)
    return HttpResponse.json(mutateDb((db) => {
      db.favorites[session.user.id] = (db.favorites[session.user.id] ?? []).filter((item) => item !== id)
      return db.favorites[session.user.id]
    }))
  }),
]

function quantityConflict(nftId: number, quantity: number) {
  const nft = toNftDto(nftId)!
  const limit = limitFor(nftId)
  return fail(409, 'quantity_limit',
    limit === 0
      ? `${nft.name} está esgotado.`
      : `Você pode levar no máximo ${limit} unidade(s) de ${nft.name}.`,
    { details: { nftId, requested: quantity, limit } })
}

const cartHandlers = [
  http.get('/api/cart', async ({ request }) => {
    const blocked = await gate(request)
    if (blocked) return blocked
    return HttpResponse.json(readCartDto(loadDb(), ownerKey(request)))
  }),
  http.post('/api/cart/items', async ({ request }) => {
    const blocked = await gate(request)
    if (blocked) return blocked
    const body = await readJson(request)
    const nftId = body?.nftId
    const quantity = body?.quantity
    if (!Number.isInteger(nftId) || !Number.isInteger(quantity) || (quantity as number) < 1) {
      return fail(422, 'invalid_body', 'Informe um NFT e uma quantidade válida.')
    }
    if (!toNftDto(nftId as number)) return fail(404, 'nft_not_found', 'Este NFT não foi encontrado.')
    const key = ownerKey(request)
    const current = loadDb().carts[key]?.items[String(nftId)] ?? 0
    const next = current + (quantity as number)
    if (next > limitFor(nftId as number)) return quantityConflict(nftId as number, next)
    return HttpResponse.json(mutateDb((db) => writeCart(db, key, { ...(db.carts[key]?.items ?? {}), [String(nftId)]: next })), { status: 201 })
  }),
  http.patch('/api/cart/items/:id', async ({ request, params }) => {
    const blocked = await gate(request)
    if (blocked) return blocked
    const nftId = parseId(params.id)
    if (!toNftDto(nftId)) return fail(404, 'nft_not_found', 'Este NFT não foi encontrado.')
    const body = await readJson(request)
    const quantity = body?.quantity
    if (!Number.isInteger(quantity) || (quantity as number) < 0) return fail(422, 'invalid_body', 'Informe uma quantidade válida.')
    if ((quantity as number) > limitFor(nftId)) return quantityConflict(nftId, quantity as number)
    const key = ownerKey(request)
    return HttpResponse.json(mutateDb((db) => {
      const items = { ...(db.carts[key]?.items ?? {}) }
      if (quantity === 0) delete items[String(nftId)]
      else items[String(nftId)] = quantity as number
      return writeCart(db, key, items)
    }))
  }),
  http.delete('/api/cart/items/:id', async ({ request, params }) => {
    const blocked = await gate(request)
    if (blocked) return blocked
    const nftId = parseId(params.id)
    const key = ownerKey(request)
    return HttpResponse.json(mutateDb((db) => {
      const items = { ...(db.carts[key]?.items ?? {}) }
      delete items[String(nftId)]
      return writeCart(db, key, items)
    }))
  }),
  http.post('/api/cart/merge', ({ request }) => {
    const session = sessionForRequest(request)
    if (!session) return unauthorized()
    const guestKey = `guest:${request.headers.get('X-Guest-Id') ?? 'anonymous'}`
    return HttpResponse.json(mutateDb((db) => {
      const merged = { ...(db.carts[session.user.id]?.items ?? {}) }
      Object.entries(db.carts[guestKey]?.items ?? {}).forEach(([id, quantity]) => {
        merged[id] = Math.min(limitFor(Number(id)), (merged[id] ?? 0) + quantity)
        if (merged[id] <= 0) delete merged[id]
      })
      delete db.carts[guestKey]
      return writeCart(db, session.user.id, merged)
    }))
  }),
]

const quoteHandlers = [
  http.post('/api/quote', async ({ request }) => {
    const blocked = await gate(new Request(request.url, { method: 'GET' }))
    if (blocked) return blocked
    const body = await readJson(request)
    const items = parseItems(body?.items)
    if (!items) return fail(422, 'invalid_body', 'Os itens da cotação são inválidos.')
    const network = body?.network === undefined ? 'Ethereum' : body.network
    if (!isNetwork(network)) return fail(422, 'invalid_body', 'Rede inválida.', { fieldErrors: { network: 'Rede inválida.' } })
    const coupon = typeof body?.coupon === 'string' ? body.coupon : undefined
    return HttpResponse.json(computeQuote(items, coupon, network))
  }),
]

function tokenIdFor(nftId: number): string {
  return `#${String(nftId).padStart(4, '0')}`
}

function validateCollector(collector: unknown, wallet: unknown): Record<string, string> {
  const errors: Record<string, string> = {}
  const details = (collector && typeof collector === 'object' ? collector : {}) as Partial<CollectorDetails>
  const account = (wallet && typeof wallet === 'object' ? wallet : {}) as Partial<WalletAccount>
  if (!details.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) errors.email = 'Informe um e-mail válido.'
  if (!isNetwork(details.network)) errors.network = 'Selecione uma rede válida.'
  if (!account.address || account.address.trim().length < 6) errors.wallet = 'Selecione uma carteira com endereço válido.'
  return errors
}

const orderHandlers = [
  http.post('/api/orders', async ({ request }) => {
    const session = sessionForRequest(request)
    if (!session) return unauthorized()
    const key = request.headers.get('Idempotency-Key')?.trim()
    if (!key) return fail(400, 'idempotency_key_required', 'O cabeçalho Idempotency-Key é obrigatório.')

    const body = await readJson(request) as Partial<CreateOrderRequest> | undefined
    const items = parseItems(body?.items)
    if (!body || !items || items.length === 0) return fail(422, 'invalid_body', 'O pedido precisa ter pelo menos um item.')
    const fieldErrors = validateCollector(body.collector, body.wallet)
    if (Object.keys(fieldErrors).length > 0) return fail(422, 'validation_error', 'Revise os dados do pedido.', { fieldErrors })

    const collector = body.collector as CollectorDetails
    const wallet = body.wallet as WalletAccount
    const coupon = normalizeCoupon(body.coupon)
    const fingerprint = orderFingerprint(items, coupon, collector, wallet.address)
    const db = loadDb()
    const idempotencyKey = `${session.user.id}:${key}`
    const known = db.idempotency[idempotencyKey]
    if (known) {
      if (known.fingerprint !== fingerprint) {
        return fail(409, 'idempotency_conflict', 'Esta chave de idempotência já foi usada com um pedido diferente.')
      }
      const existing = db.orders[known.orderId]
      if (existing) return HttpResponse.json(publicOrder(existing), { status: 200 })
    }

    const quote = computeQuote(items, coupon, collector.network)
    const unavailable = mergeItems(items).find(({ nftId, quantity }) => (toNftDto(nftId)?.available ?? 0) < quantity)
    if (unavailable) {
      const nft = toNftDto(unavailable.nftId)
      return fail(409, 'availability_conflict',
        `${nft?.name ?? 'Um item'} não tem unidades suficientes.`, { details: { quote } })
    }
    if (couponStatusFor(coupon) === 'expired' || (coupon && couponStatusFor(coupon) === 'invalid')) {
      return fail(409, 'quote_changed', 'O cupom informado não é válido. Revise o resumo.', { details: { quote } })
    }
    if (quote.version !== body.quoteVersion || quote.totalEth !== body.quotedTotalEth) {
      return fail(409, 'quote_changed', 'Os valores mudaram. Revise o novo resumo antes de pagar.', { details: { quote } })
    }

    const lines: OrderLine[] = quote.lines.map((line) => ({
      nftId: line.nftId,
      name: line.name,
      image: line.image,
      edition: line.edition,
      tokenId: tokenIdFor(line.nftId),
      quantity: line.quantity,
      unitPriceEth: line.unitPriceEth,
      lineTotalEth: line.lineTotalEth,
    }))
    const now = new Date().toISOString()
    const scenario = db.scenario
    const order = mutateDb((state) => {
      const created: StoredOrder = {
        id: `ord-${crypto.randomUUID().slice(0, 8)}`,
        idempotencyKey: key,
        status: 'pending',
        version: 1,
        createdAt: now,
        updatedAt: now,
        collector,
        wallet,
        lines,
        subtotalEth: quote.subtotalEth,
        coupon: quote.couponStatus === 'valid' ? quote.coupon : '',
        discountEth: quote.discountEth,
        feeEth: quote.feeEth,
        totalEth: quote.totalEth,
        transactionId: '',
        explorerUrl: '',
        failureReason: '',
        userId: session.user.id,
        fingerprint,
        settleAt: Date.now() + settleDelayMs,
        hold: scenario === 'payment-hold',
        plannedOutcome: scenario === 'payment-declined' ? 'declined' : 'confirmed',
        cartLines: items,
      }
      state.orders[created.id] = created
      state.idempotency[idempotencyKey] = { fingerprint, orderId: created.id }
      emitRealtime({
        eventId: nextEventId(state),
        type: 'order.updated',
        orderId: created.id,
        userId: created.userId,
        version: created.version,
        status: created.status,
      })
      return created
    })
    scheduleSettlement(order)

    if (scenario === 'payment-timeout') {
      await delay(500)
      return fail(504, 'gateway_timeout', 'O pagamento demorou para responder. Tente novamente com segurança.')
    }
    return HttpResponse.json(publicOrder(order), { status: 201 })
  }),
  http.get('/api/orders', async ({ request }) => {
    const blocked = await gate(request)
    if (blocked) return blocked
    const session = sessionForRequest(request)
    if (!session) return unauthorized()
    return HttpResponse.json(Object.values(loadDb().orders)
      .filter((order) => order.userId === session.user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(publicOrder))
  }),
  http.get('/api/orders/:id', async ({ request, params }) => {
    const blocked = await gate(request)
    if (blocked) return blocked
    const session = sessionForRequest(request)
    if (!session) return unauthorized()
    const id = String(params.id)
    let order = loadDb().orders[id]
    if (!order || order.userId !== session.user.id) return fail(404, 'order_not_found', 'Este pedido não foi encontrado.')
    if (order.status === 'pending' && !order.hold && order.settleAt <= Date.now()) {
      order = settleOrder(id, order.plannedOutcome) ?? order
    }
    return HttpResponse.json(publicOrder(order))
  }),
]

const controlHandlers = [
  http.post('/api/__mock/reset', async ({ request }) => {
    const body = await readJson(request)
    clearSettlementTimers()
    const scenario = mockScenarios.includes(body?.scenario as MockScenario) ? body?.scenario as MockScenario : 'default'
    resetMockDatabase(scenario)
    return HttpResponse.json({ ok: true, scenario })
  }),
  http.post('/api/__mock/scenario', async ({ request }) => {
    const body = await readJson(request)
    const scenario = body?.scenario as MockScenario
    if (!mockScenarios.includes(scenario)) return fail(422, 'invalid_scenario', 'Cenário inválido.')
    const latency = typeof body?.latencyMs === 'number' ? Math.max(0, body.latencyMs) : null
    mutateDb((db) => { db.scenario = scenario; db.latencyMs = latency; db.flakyServed = [] })
    return HttpResponse.json({ ok: true, scenario })
  }),
  http.post('/api/__mock/fail', async ({ request }) => {
    const body = await readJson(request)
    const prefix = typeof body?.prefix === 'string' ? body.prefix : ''
    if (!prefix.startsWith('/api/')) return fail(422, 'invalid_failure', 'Informe um prefixo /api/… válido.')
    const method = typeof body?.method === 'string' ? body.method.toUpperCase() : 'POST'
    const status = Number.isInteger(body?.status) ? body?.status as number : 503
    const remaining = Number.isInteger(body?.times) ? body?.times as number : 1
    mutateDb((db) => { db.failures = [...(db.failures ?? []).filter((item) => item.remaining > 0), { method, prefix, status, remaining }] })
    return HttpResponse.json({ ok: true })
  }),
  http.post('/api/__mock/nft/:id', async ({ request, params }) => {
    const id = parseId(params.id)
    if (!toNftDto(id)) return fail(404, 'nft_not_found', 'Este NFT não foi encontrado.')
    const body = await readJson(request)
    const event = mutateDb((db) => {
      const stored = db.nfts[String(id)]
      if (typeof body?.priceEth === 'string' && /^\d+(\.\d{1,18})?$/.test(body.priceEth)) stored.priceEth = body.priceEth
      if (Number.isInteger(body?.available) && (body?.available as number) >= 0) stored.stock = body?.available as number
      stored.version += 1
      const created: RealtimeEvent = {
        eventId: nextEventId(db),
        type: 'nft.updated',
        nftId: id,
        version: stored.version,
        priceEth: stored.priceEth,
        available: stored.stock,
      }
      emitRealtime(created)
      return created
    })
    return HttpResponse.json(event)
  }),
  http.post('/api/__mock/order/:id/settle', async ({ request, params }) => {
    const body = await readJson(request)
    const order = settleOrder(String(params.id), body?.outcome === 'declined' ? 'declined' : 'confirmed')
    return order ? HttpResponse.json(publicOrder(order)) : fail(404, 'order_not_found', 'Este pedido não foi encontrado.')
  }),
  http.post('/api/__mock/socket/disconnect', () => {
    setSocketServerPaused(true)
    return HttpResponse.json({ ok: true })
  }),
  http.post('/api/__mock/socket/reconnect', () => {
    setSocketServerPaused(false)
    return HttpResponse.json({ ok: true })
  }),
  http.post('/api/__mock/socket/drop', () => {
    disconnectAllSockets()
    return HttpResponse.json({ ok: true, connected: connectedSocketCount() })
  }),
  http.post('/api/__mock/socket/emit', async ({ request }) => {
    const body = await readJson(request)
    const event = body?.event as RealtimeEvent | undefined
    if (!event || (event.type !== 'nft.updated' && event.type !== 'order.updated')) {
      return fail(422, 'invalid_event', 'Evento inválido.')
    }
    emitRealtime(event)
    return HttpResponse.json({ ok: true })
  }),
  http.get('/api/__mock/socket/status', () => HttpResponse.json({ connected: connectedSocketCount() })),
  http.post('/api/__mock/session/expire', ({ request }) => {
    const session = sessionForRequest(request)
    if (!session) return unauthorized()
    mutateDb((db) => { db.revokedTokens.push(session.token) })
    return HttpResponse.json({ ok: true })
  }),
]

export const commerceHandlers = [
  ...nftHandlers,
  ...favoriteHandlers,
  ...cartHandlers,
  ...quoteHandlers,
  ...orderHandlers,
  ...controlHandlers,
]
