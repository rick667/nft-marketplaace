import { addToCart, reviewOrder, submitButton } from './checkout'
import { expect, test } from './fixtures'

test.describe('retomada de pedido pendente', () => {
  test('pedido liquidado durante a queda do socket é reconciliado ao reconectar', async ({ app, mock, page }) => {
    await addToCart(app, page)
    await app.login(undefined, '/payment')
    await mock.scenario('payment-hold')
    await reviewOrder(page)
    await submitButton(page).click()
    await expect(page).toHaveURL(/\/order\//)
    const orderId = page.url().split('/order/')[1].split(/[?#]/)[0]
    await expect(page.locator('.order-status-pending')).toBeVisible()
    await app.waitRealtime('connected')

    await mock.pauseSocketServer()
    await expect(page.getByTestId('realtime-indicator')).toBeVisible({ timeout: 15_000 })
    await mock.settle(orderId, 'confirmed')
    await expect(page.locator('.order-status-pending')).toBeVisible()

    await mock.resumeSocketServer()
    await expect(page.locator('.order-status-confirmed')).toBeVisible({ timeout: 15_000 })
  })

  test('evento de pedido de outro usuário não altera o pedido atual', async ({ app, mock, page }) => {
    await addToCart(app, page)
    await app.login(undefined, '/payment')
    await mock.scenario('payment-hold')
    await reviewOrder(page)
    await submitButton(page).click()
    await expect(page.locator('.order-status-pending')).toBeVisible()
    const orderId = page.url().split('/order/')[1].split(/[?#]/)[0]
    await app.waitRealtime('connected')
    await mock.emit({ eventId: 'evt-estranho', type: 'order.updated', orderId, userId: 'usuario-inexistente', version: 99, status: 'confirmed' })
    await page.waitForTimeout(500)
    await expect(page.locator('.order-status-pending')).toBeVisible()
  })
})
