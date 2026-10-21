export type Network = 'Ethereum' | 'Polygon' | 'Solana'
export type WalletProvider = 'MetaMask' | 'Coinbase Wallet' | 'WalletConnect'
export type OrderStatus = 'pending' | 'confirmed' | 'declined'
export type NftSort = 'recent' | 'price-asc' | 'price-desc' | 'popular'
export type NftTab = 'all' | 'new' | 'trending' | 'favorites'

export type ApiErrorBody = {
  code: string
  message: string
  fieldErrors?: Record<string, string>
  details?: unknown
}

export type NftDto = {
  id: number
  name: string
  image: string
  priceEth: string
  category: string
  edition: string
  network: Network
  creator: string
  likes: number
  available: number
  maxPerOrder: number
  version: number
}

export type NftListQuery = {
  q?: string
  category?: string
  network?: Network | ''
  minPrice?: string
  maxPrice?: string
  sort?: NftSort
  tab?: NftTab
  page?: number
  pageSize?: number
}

export type NftListResponse = {
  items: NftDto[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type CartItemDto = { nftId: number; quantity: number }

export type CartDto = {
  items: CartItemDto[]
  version: number
}

export type QuoteRequest = {
  items: CartItemDto[]
  coupon?: string
  network?: Network
}

export type QuoteLine = {
  nftId: number
  name: string
  image: string
  edition: string
  quantity: number
  requestedQuantity: number
  unitPriceEth: string
  lineTotalEth: string
  available: number
}

export type CouponStatus = 'none' | 'valid' | 'invalid' | 'expired'

export type QuoteDto = {
  quoteId: string
  version: number
  lines: QuoteLine[]
  subtotalEth: string
  discountEth: string
  feeEth: string
  totalEth: string
  coupon: string
  couponStatus: CouponStatus
  network: Network
  warnings: string[]
}

export type CollectorDetails = {
  displayName: string
  username: string
  network: Network
  profileName: string
  walletAddress: string
  ens: string
  walletType: WalletProvider
  referralCode: string
  email: string
  ensName: string
  note: string
}

export type WalletAccount = {
  id: string
  label: string
  provider: WalletProvider
  address: string
  network: Network
  isPrimary: boolean
  displayName?: string
  profileName?: string
  ens?: string
  referralCode?: string
  email?: string
  ensName?: string
  sameAsPrimary?: boolean
}

export type OrderLine = {
  nftId: number
  name: string
  image: string
  edition: string
  tokenId: string
  quantity: number
  unitPriceEth: string
  lineTotalEth: string
}

export type CreateOrderRequest = {
  items: CartItemDto[]
  coupon: string
  quoteVersion: number
  quotedTotalEth: string
  collector: CollectorDetails
  wallet: WalletAccount
}

export type OrderDto = {
  id: string
  idempotencyKey: string
  status: OrderStatus
  version: number
  createdAt: string
  updatedAt: string
  collector: CollectorDetails
  wallet: WalletAccount
  lines: OrderLine[]
  subtotalEth: string
  coupon: string
  discountEth: string
  feeEth: string
  totalEth: string
  transactionId: string
  explorerUrl: string
  failureReason: string
}

export type QuoteChangedBody = ApiErrorBody & { details: { quote: QuoteDto } }

export type NftUpdatedEvent = {
  eventId: string
  type: 'nft.updated'
  nftId: number
  version: number
  priceEth: string
  available: number
}

export type OrderUpdatedEvent = {
  eventId: string
  type: 'order.updated'
  orderId: string
  userId: string
  version: number
  status: OrderStatus
}

export type RealtimeEvent = NftUpdatedEvent | OrderUpdatedEvent
