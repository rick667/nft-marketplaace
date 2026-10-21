import { expect, test } from './fixtures'

async function addNft(app: { open: (path: string) => Promise<void> }, page: import('@playwright/test').Page, id = 42, extra = 0) {
  await app.open(`/nft/${id}`)
  for (let index = 0; index < extra; index += 1) await page.getByRole('button', { name: 'Aumentar quantidade' }).click()
  await page.getByRole('button', { name: 'COMPRAR' }).click()
  await expect(page.getByRole('link', { name: new RegExp(`Abrir carrinho, ${1 + extra} NFTs`) })).toBeVisible()
}

test.describe('carrinho', () => {
  test('carrinho vazio mostra estado vazio', async ({ app, page }) => {
    await app.open('/cart')
    await expect(page.getByRole('heading', { name: 'Seu carrinho está vazio' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Conectar e finalizar' })).toBeDisabled()
  })

  test('altera quantidade, remove item e totais acompanham', async ({ app, page }) => {
    await addNft(app, page, 42, 1)
    await app.open('/cart')
    const qty = page.locator('.cart-quantity span')
    await expect(qty).toHaveText('2')
    await expect(page.locator('.cart-line-total')).toContainText('2.38')
    await page.getByRole('button', { name: 'Diminuir quantidade de Emerald Ape #042' }).click()
    await expect(qty).toHaveText('1')
    await expect(page.locator('.cart-line-total')).toContainText('1.19')
    await page.getByRole('button', { name: 'Remover Emerald Ape #042 do carrinho' }).click()
    await expect(page.getByRole('heading', { name: 'Seu carrinho está vazio' })).toBeVisible()
  })

  test('cupom válido, inválido e expirado', async ({ app, page }) => {
    await addNft(app, page)
    await app.open('/cart')
    const input = page.getByLabel('Código promocional')
    await input.fill('KURIO10')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.locator('.cart-coupon-success')).toContainText('KURIO10')
    await input.fill('NAOEXISTE')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.locator('.cart-coupon-error')).toContainText('Cupom inválido')
    await input.fill('KURIO-OLD')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.locator('.cart-coupon-error')).toContainText('expirou')
  })

  test('carrinho persiste após recarregar a página', async ({ app, page }) => {
    await addNft(app, page, 42, 1)
    await app.open('/cart')
    await expect(page.locator('.cart-quantity span')).toHaveText('2')
    await page.reload()
    await expect(page.locator('.cart-quantity span')).toHaveText('2')
  })

  test('carrinho de convidado é preservado após o login', async ({ app, page }) => {
    await addNft(app, page)
    await app.login()
    await app.open('/cart')
    await expect(page.locator('.cart-item')).toHaveCount(1)
    await expect(page.locator('.cart-item h2')).toHaveText('Emerald Ape #042')
  })

  test('falha ao alterar quantidade restaura o valor anterior', async ({ app, mock, page }) => {
    await addNft(app, page)
    await app.open('/cart')
    await expect(page.locator('.cart-quantity span')).toHaveText('1')
    await mock.fail('PATCH', '/api/cart', 503, 5)
    await page.getByRole('button', { name: 'Aumentar quantidade de Emerald Ape #042' }).click()
    await expect(page.locator('.toast')).toBeVisible()
    await expect(page.locator('.cart-quantity span')).toHaveText('1')
  })
})
