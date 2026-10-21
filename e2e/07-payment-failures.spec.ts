import { addToCart, reviewOrder, submitButton } from './checkout'
import { expect, test } from './fixtures'

test.describe('falhas de pagamento', () => {
  test('pagamento recusado mostra o estado e preserva o histórico', async ({ app, mock, page }) => {
    await addToCart(app, page)
    await app.login(undefined, '/payment')
    await mock.scenario('payment-declined')
    await reviewOrder(page)
    await submitButton(page).click()
    await expect(page).toHaveURL(/\/order\//)
    await expect(page.locator('.order-status-declined')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Pedido recusado').first()).toBeVisible()
  })

  test('clique repetido em confirmar cria um único pedido', async ({ app, page }) => {
    await addToCart(app, page)
    await app.login(undefined, '/payment')
    await reviewOrder(page)
    const button = submitButton(page)
    await button.evaluate((element: HTMLElement) => { element.click(); element.click(); element.click() })
    await expect(page).toHaveURL(/\/order\//)
    const count = await page.evaluate(async () => {
      const token = (JSON.parse(localStorage.getItem('kurio-auth-session') ?? '{}') as { token: string }).token
      const response = await fetch('/api/orders', { headers: { authorization: `Bearer ${token}` } })
      return ((await response.json()) as unknown[]).length
    })
    expect(count).toBe(1)
  })

  test('timeout do gateway permite repetir sem duplicar o pedido', async ({ app, mock, page }) => {
    await addToCart(app, page)
    await app.login(undefined, '/payment')
    await mock.scenario('payment-timeout')
    await reviewOrder(page)
    await submitButton(page).click()
    await expect(page.locator('.payment-error')).toContainText('não foi duplicado')
    await expect(page).toHaveURL(/\/payment/)

    await mock.scenario('default')
    await submitButton(page).click()
    await expect(page).toHaveURL(/\/order\//)
    const count = await page.evaluate(async () => {
      const token = (JSON.parse(localStorage.getItem('kurio-auth-session') ?? '{}') as { token: string }).token
      const response = await fetch('/api/orders', { headers: { authorization: `Bearer ${token}` } })
      return ((await response.json()) as unknown[]).length
    })
    expect(count).toBe(1)
  })

  test('pedido pendente sobrevive ao reload e é confirmado ao vivo', async ({ app, mock, page }) => {
    await addToCart(app, page)
    await app.login(undefined, '/payment')
    await mock.scenario('payment-hold')
    await reviewOrder(page)
    await submitButton(page).click()
    await expect(page).toHaveURL(/\/order\//)
    const orderId = page.url().split('/order/')[1].split(/[?#]/)[0]
    await expect(page.locator('.order-status-pending')).toBeVisible()
    await page.reload()
    await expect(page.locator('.order-status-pending')).toBeVisible()
    await app.waitRealtime('connected')
    await mock.settle(orderId, 'confirmed')
    await expect(page.locator('.order-status-confirmed')).toBeVisible({ timeout: 10_000 })
  })
})
