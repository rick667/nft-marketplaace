import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { getGuestId, isTransientError } from './client'
import type { CartDto, NftDto, NftListQuery, NftListResponse, Network, QuoteDto } from './contracts'
import {
  addCartItem,
  addFavorite,
  createOrder,
  getCart,
  getNft,
  getOrder,
  listFavoriteIds,
  listNfts,
  removeCartItem,
  removeFavorite,
  requestQuote,
  updateCartItem,
} from './endpoints'

export const maxQuantityPerNft = 10

export const queryKeys = {
  nfts: ['nfts'] as const,
  nftList: (query: NftListQuery, ownerId: string) => ['nfts', 'list', ownerId, query] as const,
  nft: (id: string | number) => ['nfts', 'detail', String(id)] as const,
  favorites: (ownerId: string) => ['favorites', ownerId] as const,
  cart: (ownerId: string) => ['cart', ownerId] as const,
  quote: (ownerId: string, signature: string) => ['quote', ownerId, signature] as const,
  order: (ownerId: string, id: string) => ['orders', ownerId, id] as const,
}

const retry = (failureCount: number, reason: unknown) => failureCount < 2 && isTransientError(reason)

export function useOwnerId(): { ownerId: string; userId?: string } {
  const { session } = useAuth()
  const userId = session?.user.id
  return { ownerId: userId ?? `guest:${getGuestId()}`, userId }
}

export function useNftList(query: NftListQuery) {
  const { ownerId } = useOwnerId()
  return useQuery({
    queryKey: queryKeys.nftList(query, ownerId),
    queryFn: ({ signal }) => listNfts(query, signal),
    placeholderData: keepPreviousData,
    retry,
  })
}

export function useNftQuery(id: string | number) {
  return useQuery({
    queryKey: queryKeys.nft(id),
    queryFn: ({ signal }) => getNft(id, signal),
    retry: (count, reason) => count < 2 && isTransientError(reason),
  })
}

export function useFavorites() {
  const { ownerId, userId } = useOwnerId()
  const query = useQuery({
    queryKey: queryKeys.favorites(ownerId),
    queryFn: ({ signal }) => listFavoriteIds(signal),
    enabled: Boolean(userId),
    retry,
  })
  return { ...query, ids: userId ? query.data ?? [] : [] }
}

export function patchNftLists(queryClient: QueryClient, nftId: number, patch: (nft: NftDto) => NftDto): void {
  queryClient.setQueriesData<NftListResponse>({ queryKey: [...queryKeys.nfts, 'list'] }, (current) =>
    current ? { ...current, items: current.items.map((item) => item.id === nftId ? patch(item) : item) } : current)
  queryClient.setQueryData<NftDto>(queryKeys.nft(nftId), (current) => current ? patch(current) : current)
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()
  const { ownerId } = useOwnerId()
  const key = queryKeys.favorites(ownerId)
  return useMutation({
    mutationFn: ({ nftId, favorite }: { nftId: number; favorite: boolean }) =>
      favorite ? addFavorite(nftId) : removeFavorite(nftId),
    onMutate: async ({ nftId, favorite }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<number[]>(key)
      queryClient.setQueryData<number[]>(key, (current = []) =>
        favorite ? (current.includes(nftId) ? current : [...current, nftId]) : current.filter((id) => id !== nftId))
      return { previous }
    },
    onError: (_reason, _variables, context) => {
      queryClient.setQueryData(key, context?.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.nfts, 'list'] })
    },
  })
}

export function useCart() {
  const { ownerId } = useOwnerId()
  const query = useQuery({
    queryKey: queryKeys.cart(ownerId),
    queryFn: ({ signal }) => getCart(signal),
    retry,
  })
  const items = query.data?.items ?? []
  return {
    ...query,
    items,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    quantityOf: (nftId: number) => items.find((item) => item.nftId === nftId)?.quantity ?? 0,
  }
}

export function useCartActions() {
  const queryClient = useQueryClient()
  const { ownerId } = useOwnerId()
  const key = queryKeys.cart(ownerId)

  const optimistic = (change: (items: Map<number, number>) => void) => async () => {
    await queryClient.cancelQueries({ queryKey: key })
    const previous = queryClient.getQueryData<CartDto>(key)
    const items = new Map((previous?.items ?? []).map((item) => [item.nftId, item.quantity]))
    change(items)
    queryClient.setQueryData<CartDto>(key, {
      version: previous?.version ?? 0,
      items: [...items].map(([nftId, quantity]) => ({ nftId, quantity })),
    })
    return { previous }
  }
  const rollback = (_reason: unknown, _variables: unknown, context: { previous?: CartDto } | undefined) => {
    queryClient.setQueryData(key, context?.previous)
  }
  const settle = () => queryClient.invalidateQueries({ queryKey: key })

  const add = useMutation({
    mutationFn: (vars: { nftId: number; quantity?: number }) => addCartItem({ nftId: vars.nftId, quantity: vars.quantity ?? 1 }),
    onMutate: (vars) => optimistic((items) => items.set(vars.nftId, (items.get(vars.nftId) ?? 0) + (vars.quantity ?? 1)))(),
    onError: rollback,
    onSettled: settle,
  })
  const setQuantity = useMutation({
    mutationFn: (vars: { nftId: number; quantity: number }) => updateCartItem(vars.nftId, vars.quantity),
    onMutate: (vars) => optimistic((items) => {
      if (vars.quantity <= 0) items.delete(vars.nftId)
      else items.set(vars.nftId, vars.quantity)
    })(),
    onError: rollback,
    onSettled: settle,
  })
  const remove = useMutation({
    mutationFn: (nftId: number) => removeCartItem(nftId),
    onMutate: (nftId) => optimistic((items) => { items.delete(nftId) })(),
    onError: rollback,
    onSettled: settle,
  })
  return { add, setQuantity, remove }
}

export function useQuote(request: { items: { nftId: number; quantity: number }[]; coupon: string; network: Network }, enabled = true) {
  const { ownerId } = useOwnerId()
  const items = [...request.items].sort((a, b) => a.nftId - b.nftId)
  const signature = JSON.stringify([items, request.coupon, request.network])
  return useQuery<QuoteDto>({
    queryKey: queryKeys.quote(ownerId, signature),
    queryFn: ({ signal }) => requestQuote({ items, coupon: request.coupon, network: request.network }, signal),
    enabled: enabled && items.length > 0,
    placeholderData: keepPreviousData,
    retry,
  })
}

export function useOrderQuery(id: string) {
  const { ownerId } = useOwnerId()
  return useQuery({
    queryKey: queryKeys.order(ownerId, id),
    queryFn: ({ signal }) => getOrder(id, signal),
    retry,
    refetchInterval: (query) => query.state.data?.status === 'pending' ? 4000 : false,
  })
}

export function useCreateOrder() {
  return useMutation({
    mutationFn: ({ request, idempotencyKey }: { request: Parameters<typeof createOrder>[0]; idempotencyKey: string }) =>
      createOrder(request, idempotencyKey),
  })
}
