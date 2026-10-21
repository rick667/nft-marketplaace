import { expect, test } from './fixtures'

test.describe('favoritos', () => {
  test('visitante é levado ao login ao favoritar', async ({ app, page }) => {
    await app.open('/')
    await page.locator('.favorite-toggle').first().click()
    await expect(app.dialog()).toBeVisible()
  })

  test('favoritar, listar na aba Favoritos e desfavoritar', async ({ app, page }) => {
    await app.login()
    await app.open('/')
    const first = page.locator('.favorite-toggle').first()
    await first.click()
    await expect(first).toHaveAttribute('aria-label', 'Remover dos favoritos')
    await page.getByRole('tab', { name: 'Favoritos' }).click()
    await expect(page.locator('.nft-card')).toHaveCount(1)
    await page.locator('.favorite-toggle').first().click()
    await expect(page.locator('.nft-card')).toHaveCount(0)
  })

  test('falha da mutation reverte o otimismo e permite nova tentativa', async ({ app, mock, page }) => {
    await app.login()
    await app.open('/')
    const first = page.locator('.favorite-toggle').first()
    await expect(first).toHaveAttribute('aria-label', 'Adicionar aos favoritos')
    await mock.fail('PUT', '/api/favorites', 503, 1)
    await first.click()
    await expect(page.locator('.toast')).toBeVisible()
    await expect(first).toHaveAttribute('aria-label', 'Adicionar aos favoritos')
    await first.click()
    await expect(first).toHaveAttribute('aria-label', 'Remover dos favoritos')
  })

  test('favoritos persistem após recarregar', async ({ app, page }) => {
    await app.login()
    await app.open('/')
    await page.locator('.favorite-toggle').first().click()
    await expect(page.locator('.favorite-toggle').first()).toHaveAttribute('aria-label', 'Remover dos favoritos')
    await page.reload()
    await expect(page.locator('.favorite-toggle').first()).toHaveAttribute('aria-label', 'Remover dos favoritos')
  })
})
