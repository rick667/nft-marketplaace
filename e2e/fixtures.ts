import { expect, test as base, type Page } from '@playwright/test'

export const demoUser = { email: 'demo@kurio.app', password: 'KurioDemo123!' }
export const otherUser = { email: 'outro@kurio.app', password: 'KurioDemo123!' }

type NftSummary = { id: number; name: string; priceEth: string; available: number; version: number }
export type NftEvent = { eventId: string; type: 'nft.updated'; nftId: number; version: number; priceEth: string; available: number }

// Controles do backend simulado (MSW): passam pelos handlers do navegador, nunca pela UI.
export class MockControl {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  private async send<T = unknown>(path: string, body: unknown = {}, withSession = false): Promise<T> {
    return this.page.evaluate(async ({ path, body, withSession }) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (withSession) {
        const raw = localStorage.getItem('kurio-auth-session')
        if (raw) headers.authorization = `Bearer ${(JSON.parse(raw) as { token: string }).token}`
      }
      const response = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) })
      return response.json()
    }, { path, body, withSession }) as Promise<T>
  }

  reset(scenario?: string) {
    return this.send('/api/__mock/reset', scenario ? { scenario } : {})
  }

  scenario(scenario: string, latencyMs?: number) {
    return this.send('/api/__mock/scenario', { scenario, ...(latencyMs === undefined ? {} : { latencyMs }) })
  }

  fail(method: string, prefix: string, status = 503, times = 1) {
    return this.send('/api/__mock/fail', { method, prefix, status, times })
  }

  updateNft(id: number, patch: { priceEth?: string; available?: number }) {
    return this.send<NftEvent>(`/api/__mock/nft/${id}`, patch)
  }

  emit(event: Record<string, unknown>) {
    return this.send('/api/__mock/socket/emit', { event })
  }

  settle(orderId: string, outcome: 'confirmed' | 'declined' | 'failed' = 'confirmed') {
    return this.send(`/api/__mock/order/${orderId}/settle`, { outcome })
  }

  dropSockets() {
    return this.send('/api/__mock/socket/drop')
  }

  pauseSocketServer() {
    return this.send('/api/__mock/socket/disconnect')
  }

  resumeSocketServer() {
    return this.send('/api/__mock/socket/reconnect')
  }

  expireSession() {
    return this.send('/api/__mock/session/expire', {}, true)
  }

  async nft(id: number): Promise<NftSummary> {
    return this.page.evaluate(async (id) => (await fetch(`/api/nfts/${id}`)).json() as Promise<NftSummary>, id)
  }
}

export class App {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async open(path = '/') {
    await this.page.goto(path)
    await this.page.waitForFunction(() => document.documentElement.dataset.realtime !== undefined)
  }

  async waitRealtime(status: 'connected' | 'connecting' | 'disconnected' = 'connected') {
    await expect(this.page.locator('html')).toHaveAttribute('data-realtime', status, { timeout: 15_000 })
  }

  dialog() {
    return this.page.getByRole('dialog')
  }

  // Entra pela rota protegida: o guard abre o modal e devolve o usuário à rota pedida.
  async login(user = demoUser, returnTo = '/profile') {
    await this.open(returnTo)
    const dialog = this.dialog()
    await dialog.getByLabel('E-mail').fill(user.email)
    await dialog.getByLabel('Senha', { exact: true }).fill(user.password)
    await dialog.locator('form').getByRole('button', { name: 'Entrar' }).click()
    await expect(this.dialog()).toHaveCount(0)
    await this.page.waitForFunction(() => document.documentElement.dataset.realtime !== undefined)
  }

  async sessionToken() {
    return this.page.evaluate(() => (JSON.parse(localStorage.getItem('kurio-auth-session') ?? 'null') as { token?: string } | null)?.token)
  }
}

export const test = base.extend<{ app: App; mock: MockControl }>({
  app: async ({ page }, provide) => { await provide(new App(page)) },
  mock: async ({ page }, provide) => { await provide(new MockControl(page)) },
})

export { expect }
