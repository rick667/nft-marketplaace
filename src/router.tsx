import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import App from './App'
import CartPage from './CartPage'
import NftDetailPage from './NftDetailPage'
import OrderPage from './OrderPage'
import PaymentPage from './PaymentPage'
import CollectorProfilePage from './CollectorProfilePage'
import CollectorWalletsPage from './CollectorWalletsPage'
import NotFoundPage, { RouteErrorPage } from './NotFoundPage'
import RootLayout from './auth/RootLayout'
import { readAuthSession, requestAuthentication } from './auth/auth'
import { validateCatalogSearch } from './catalogSearch'

const rootRoute = createRootRoute({
  component: RootLayout,
})

function requireAuthentication(returnTo: string) {
  if (!readAuthSession()) {
    requestAuthentication(returnTo, 'Entre na sua conta para continuar. Depois, você voltará para esta etapa.')
    throw redirect({ to: '/', search: { cart: false }, replace: true })
  }
}

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: validateCatalogSearch,
  component: App,
})

const nftDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/nft/$nftId',
  component: NftDetailPage,
})

const cartRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cart',
  component: CartPage,
})

const paymentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/payment',
  beforeLoad: () => requireAuthentication('/payment'),
  component: PaymentPage,
})

const orderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/order/$orderId',
  beforeLoad: ({ params }) => requireAuthentication(`/order/${encodeURIComponent(params.orderId)}`),
  component: OrderPage,
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  beforeLoad: () => requireAuthentication('/profile'),
  component: CollectorProfilePage,
})

const walletsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wallets',
  beforeLoad: () => requireAuthentication('/wallets'),
  component: CollectorWalletsPage,
})

const routeTree = rootRoute.addChildren([homeRoute, nftDetailRoute, cartRoute, paymentRoute, orderRoute, profileRoute, walletsRoute])

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundPage,
  defaultErrorComponent: RouteErrorPage,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
