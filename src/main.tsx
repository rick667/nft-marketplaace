import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { enableMocking } from './mocks/enable'
import { apiErrorStatus } from './api/client'
import { handleRejectedSession } from './auth/auth'

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (reason) => {
      if (apiErrorStatus(reason) === 401) handleRejectedSession()
    },
  }),
  defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: true } },
})
const rootElement = document.getElementById('root')

if (!rootElement) throw new Error('Não foi possível localizar o elemento raiz da aplicação.')
const root = createRoot(rootElement)

enableMocking()
  .catch((reason: unknown) => {
    console.error(reason)
  })
  // O router (e o socket.io-client) só carrega depois do MSW, que precisa substituir o WebSocket global antes.
  .then(() => import('./router'))
  .then(({ router }) => {
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </StrictMode>,
    )
  })
