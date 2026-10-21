import { addToCart, reviewOrder, submitButton } from './checkout'
import { expect, test } from './fixtures'

test.describe('compra completa', () => {
  test('visitante é enviado ao login e retorna ao pagamento', async ({ app, page }) => {
    await addToCart(app, page)
    await app.open('/cart')
    await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
    await expect(app.dialog()).toBeVisible()
  })

  test('do carrinho ao recibo com pedido confirmado', async ({ app, page }) => {
    await addToCart(app, page, 42, 2)
    await app.login()
    await app.open('/cart')
    await expect(page.locator('.cart-quantity span')).toHaveText('2')
    await page.getByLabel('Código promocional').fill('KURIO10')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.locator('.cart-coupon-success')).toBeVisible()
    await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
    await expect(page).toHaveURL(/\/payment/)

    await reviewOrder(page)
    await submitButton(page).click()
    await expect(page).toHaveURL(/\/order\/[\w-]+/)
    await expect(page.locator('.order-status-pending, .order-status-confirmed')).toBeVisible()
    await expect(page.locator('.order-status-confirmed')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.order-total strong')).toBeVisible()

    await page.reload()
    await expect(page.locator('.order-status-confirmed')).toBeVisible()

    await app.open('/cart')
    await expect(page.getByRole('heading', { name: 'Seu carrinho está vazio' })).toBeVisible()
  })

  test('formulário obrigatório bloqueia a revisão incompleta', async ({ app, page }) => {
    await addToCart(app, page)
    await app.login(undefined, '/payment')
    await submitButton(page).click()
    await expect(page.locator('.payment-review')).toHaveCount(0)
    await expect(page.locator('input:invalid, select:invalid').first()).toBeVisible()
  })

  test('pedido de outro usuário não é acessível', async ({ app, page }) => {
    await addToCart(app, page)
    await app.login(undefined, '/payment')
    await reviewOrder(page)
    await submitButton(page).click()
    await expect(page).toHaveURL(/\/order\/([\w-]+)/)
    const orderUrl = page.url()
    await app.open('/')
    await page.getByRole('button', { name: 'Sair' }).filter({ visible: true }).first().click()
    await app.login({ email: 'outro@kurio.app', password: 'KurioDemo123!' }, '/profile')
    await app.open(new URL(orderUrl).pathname)
    await expect(page.getByRole('heading', { name: 'Pedido não encontrado' })).toBeVisible()
  })
})
