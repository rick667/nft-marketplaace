import { addToCart, reviewOrder, submitButton } from './checkout'
import { expect, test } from './fixtures'

const apeCard = (page: import('@playwright/test').Page) => page.locator('.nft-card').filter({ hasText: 'Emerald Ape #042' })

test.describe('tempo real (Socket.IO)', () => {
  test('preço atualizado ao vivo na listagem', async ({ app, mock, page }) => {
    await app.open('/')
    await app.waitRealtime('connected')
    await expect(apeCard(page)).toContainText('1.19')
    await mock.updateNft(42, { priceEth: '2.5' })
    await expect(apeCard(page)).toContainText('2.5')
    await expect(apeCard(page)).not.toContainText('1.19')
  })

  test('eventos duplicados ou antigos são ignorados', async ({ app, mock, page }) => {
    await app.open('/')
    await app.waitRealtime('connected')
    const event = await mock.updateNft(42, { priceEth: '2.5' })
    await expect(apeCard(page)).toContainText('2.5')
    await mock.emit({ ...event, priceEth: '8.88' })
    await mock.emit({ ...event, eventId: 'evento-antigo', version: event.version - 1, priceEth: '9.99' })
    await mock.updateNft(42, { priceEth: '3.1' })
    await expect(apeCard(page)).toContainText('3.1')
    await expect(apeCard(page)).not.toContainText('8.88')
    await expect(apeCard(page)).not.toContainText('9.99')
  })

  test('detalhe e carrinho refletem disponibilidade em tempo real', async ({ app, mock, page }) => {
    await addToCart(app, page)
    await app.open('/cart')
    await app.waitRealtime('connected')
    await expect(page.locator('.cart-item')).toHaveCount(1)
    await mock.updateNft(42, { available: 0 })
    await expect(page.locator('.cart-warnings')).toBeVisible()
  })

  test('preço muda durante o checkout: confirmação é bloqueada até revisar', async ({ app, mock, page }) => {
    await addToCart(app, page)
    await app.login(undefined, '/payment')
    await app.waitRealtime('connected')
    await reviewOrder(page)
    await mock.updateNft(42, { priceEth: '2.5' })
    await submitButton(page).click()
    await expect(page.locator('.toast')).toContainText('mudaram')
    await expect(page).toHaveURL(/\/payment/)
    await expect(submitButton(page)).toContainText(/Confirmar/)
    await submitButton(page).click()
    await expect(page).toHaveURL(/\/order\//)
  })

  test('desconexão mostra indicador e a retomada reconcilia os dados', async ({ app, mock, page }) => {
    await app.open('/')
    await app.waitRealtime('connected')
    await expect(page.getByTestId('realtime-indicator')).toHaveCount(0)
    await mock.pauseSocketServer()
    await expect(page.getByTestId('realtime-indicator')).toBeVisible({ timeout: 15_000 })
    await mock.updateNft(42, { priceEth: '4.2' })
    await expect(apeCard(page)).toContainText('1.19')
    await mock.resumeSocketServer()
    await app.waitRealtime('connected')
    await expect(apeCard(page)).toContainText('4.2')
    await expect(page.getByTestId('realtime-indicator')).toHaveCount(0)
  })

  test('um único socket por sessão após o login', async ({ app, page }) => {
    await app.login()
    await app.waitRealtime('connected')
    const status = await page.evaluate(async () => (await fetch('/api/__mock/socket/status')).json() as Promise<{ connected: number }>)
    expect(status.connected).toBe(1)
  })
})
