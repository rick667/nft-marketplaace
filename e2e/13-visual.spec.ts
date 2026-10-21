import { addToCart } from './checkout'
import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

async function settled(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(Array.from(document.images).map((image) => image.complete ? undefined : new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true })
      image.addEventListener('error', resolve, { once: true })
    })))
  })
  await expect(page.getByTestId('nft-skeleton')).toHaveCount(0)
}

test.describe('regressão visual', () => {
  test('página inicial', async ({ app, page }) => {
    await app.open('/')
    await expect(page.locator('.nft-card').first()).toBeVisible()
    await app.waitRealtime('connected')
    await settled(page)
    await expect(page).toHaveScreenshot('home.png')
  })

  test('detalhe do NFT', async ({ app, page }) => {
    await app.open('/nft/42')
    await expect(page.getByRole('heading', { level: 1, name: 'Emerald Ape #042' })).toBeVisible()
    await app.waitRealtime('connected')
    await settled(page)
    await expect(page).toHaveScreenshot('detail.png')
  })

  test('carrinho', async ({ app, page }) => {
    await addToCart(app, page, 42, 2)
    await app.open('/cart')
    await expect(page.locator('.cart-item')).toHaveCount(1)
    await app.waitRealtime('connected')
    await settled(page)
    await expect(page).toHaveScreenshot('cart.png')
  })

  test('pagamento', async ({ app, page }) => {
    await addToCart(app, page)
    await app.login(undefined, '/payment')
    await app.waitRealtime('connected')
    await settled(page)
    await expect(page).toHaveScreenshot('payment.png')
  })

  test('login', async ({ app, page }) => {
    await app.open('/profile')
    await expect(app.dialog()).toBeVisible()
    await settled(page)
    await expect(page).toHaveScreenshot('login.png')
  })
})
