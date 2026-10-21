import { apiClient } from './client'
import type {
  CartDto,
  CartItemDto,
  CreateOrderRequest,
  NftDto,
  NftListQuery,
  NftListResponse,
  OrderDto,
  QuoteDto,
  QuoteRequest,
} from './contracts'

export async function listNfts(query: NftListQuery, signal?: AbortSignal): Promise<NftListResponse> {
  const params = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== ''))
  return (await apiClient.get<NftListResponse>('/nfts', { params, signal })).data
}

export async function getNft(id: number | string, signal?: AbortSignal): Promise<NftDto> {
  return (await apiClient.get<NftDto>(`/nfts/${encodeURIComponent(String(id))}`, { signal })).data
}

export async function listFavoriteIds(signal?: AbortSignal): Promise<number[]> {
  return (await apiClient.get<number[]>('/favorites', { signal })).data
}

export async function addFavorite(nftId: number): Promise<number[]> {
  return (await apiClient.put<number[]>(`/favorites/${nftId}`)).data
}

export async function removeFavorite(nftId: number): Promise<number[]> {
  return (await apiClient.delete<number[]>(`/favorites/${nftId}`)).data
}

export async function getCart(signal?: AbortSignal): Promise<CartDto> {
  return (await apiClient.get<CartDto>('/cart', { signal })).data
}

export async function addCartItem(item: CartItemDto): Promise<CartDto> {
  return (await apiClient.post<CartDto>('/cart/items', item)).data
}

export async function updateCartItem(nftId: number, quantity: number): Promise<CartDto> {
  return (await apiClient.patch<CartDto>(`/cart/items/${nftId}`, { quantity })).data
}

export async function removeCartItem(nftId: number): Promise<CartDto> {
  return (await apiClient.delete<CartDto>(`/cart/items/${nftId}`)).data
}

export async function mergeGuestCart(): Promise<CartDto> {
  return (await apiClient.post<CartDto>('/cart/merge')).data
}

export async function requestQuote(request: QuoteRequest, signal?: AbortSignal): Promise<QuoteDto> {
  return (await apiClient.post<QuoteDto>('/quote', request, { signal })).data
}

export async function createOrder(request: CreateOrderRequest, idempotencyKey: string): Promise<OrderDto> {
  return (await apiClient.post<OrderDto>('/orders', request, { headers: { 'Idempotency-Key': idempotencyKey } })).data
}

export async function getOrder(id: string, signal?: AbortSignal): Promise<OrderDto> {
  return (await apiClient.get<OrderDto>(`/orders/${encodeURIComponent(id)}`, { signal })).data
}

export async function listOrders(signal?: AbortSignal): Promise<OrderDto[]> {
  return (await apiClient.get<OrderDto[]>('/orders', { signal })).data
}

// Controle do backend simulado: representa a carteira aprovando ou recusando a transação.
export async function simulateWalletOutcome(id: string, outcome: 'confirmed' | 'declined'): Promise<OrderDto> {
  return (await apiClient.post<OrderDto>(`/__mock/order/${encodeURIComponent(id)}/settle`, { outcome })).data
}
