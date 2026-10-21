import { addToCart, cartCounter, reviewOrder, submitButton } from './checkout'
import { expect, test } from './fixtures'

// Fluxos críticos no viewport mobile (Pixel 7, 390x844): sem overflow horizontal e com os controles mobile.
test.describe('mobile', () => {
  test('home sem overflow horizontal e com navegação inferior', async ({ app, page }) => {
    await app.open('/')
    await expect(page.locator('.nft-card').first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    await expect(page.getByRole('navigation', { name: 'Navegação mobile' })).toBeVisible()
  })

  test('busca e filtros pelo painel mobile', async ({ app, page }) => {
    await app.open('/')
    await page.getByRole('textbox', { name: 'Explorar coleções' }).fill('neon')
    await expect(page).toHaveURL(/q=neon/)
    await page.getByRole('button', { name: 'Abrir filtros' }).click()
    await expect(page.getByRole('button', { name: 'Fechar filtros' })).toBeVisible()
  })

  test('detalhe: quantidade, compra e contador do carrinho', async ({ app, page }) => {
    await addToCart(app, page, 42, 2)
    await expect(cartCounter(page, 2)).toBeVisible()
  })

  test('login modal funciona no mobile', async ({ app, page }) => {
    await app.open('/profile')
    await expect(app.dialog()).toBeVisible()
    await app.dialog().getByLabel('Senha', { exact: true }).fill('KurioDemo123!')
    await app.dialog().locator('form button[type=submit]').click()
    await expect(app.dialog()).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Alterar senha' })).toBeVisible()
  })

  test('compra completa pelo mobile até o recibo', async ({ app, page }) => {
    await addToCart(app, page)
    await app.login(undefined, '/payment')
    await reviewOrder(page)
    await submitButton(page).click()
    await expect(page).toHaveURL(/\/order\//)
    await expect(page.locator('.order-status-confirmed')).toBeVisible({ timeout: 15_000 })
  })
})
