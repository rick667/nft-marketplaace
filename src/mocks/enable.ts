import { mockScenarios, mutateDb, type MockScenario } from './db'

const startupTimeoutMs = 10_000

function requestedScenario(): MockScenario | undefined {
  const fromUrl = new URLSearchParams(window.location.search).get('mockScenario')
  const value = fromUrl ?? (import.meta.env.VITE_MOCK_SCENARIO as string | undefined)
  return mockScenarios.find((scenario) => scenario === value)
}

export async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_ENABLE_MOCKS === 'false') return
  if (!('serviceWorker' in navigator)) {
    throw new Error('Este navegador não suporta Service Workers, necessários para a API simulada.')
  }

  const start = (async () => {
    const [{ worker }, { resumePendingOrders }] = await Promise.all([import('./browser'), import('./commerce')])
    await worker.start({
      onUnhandledRequest: 'bypass',
      quiet: true,
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    })
    const scenario = requestedScenario()
    if (scenario) mutateDb((db) => { db.scenario = scenario; db.flakyServed = [] })
    resumePendingOrders()
  })()

  let timer = 0
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error('Não foi possível iniciar a API simulada. Recarregue a página.')), startupTimeoutMs)
  })
  try {
    await Promise.race([start, timeout])
  } finally {
    window.clearTimeout(timer)
  }
}
