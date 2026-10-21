import { expect, test } from './fixtures'

test.describe('detalhe do NFT', () => {
  test('acesso direto por URL mostra o NFT', async ({ app, page }) => {
    await app.open('/nft/42')
    await expect(page.getByRole('heading', { level: 1, name: 'Emerald Ape #042' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'COMPRAR' })).toBeEnabled()
  })

  test('recurso inexistente mostra estado de não encontrado', async ({ app, page }) => {
    await app.open('/nft/999')
    await expect(page.getByRole('heading', { name: 'Não encontramos este NFT.' })).toBeVisible()
    await page.getByRole('link', { name: 'Voltar ao mercado' }).click()
    await expect(page.locator('.nft-card').first()).toBeVisible()
  })

  test('rota inexistente mostra a página 404', async ({ app, page }) => {
    await app.open('/rota-que-nao-existe')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.nft-card')).toHaveCount(0)
  })

  test('quantidade respeita limites e o carrinho exibe o contador', async ({ app, page }) => {
    await app.open('/nft/42')
    const less = page.getByRole('button', { name: 'Diminuir quantidade' })
    const more = page.getByRole('button', { name: 'Aumentar quantidade' })
    await expect(less).toBeDisabled()
    await more.click()
    await more.click()
    await expect(page.locator('.detail-quantity > span').filter({ visible: true })).toHaveText('3')
    await page.getByRole('button', { name: 'COMPRAR' }).click()
    await expect(page.getByRole('link', { name: /Abrir carrinho, 3 NFTs/ })).toBeVisible()
  })
})
