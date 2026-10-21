import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

const cardNames = (page: Page) => page.locator('.nft-card .nft-title').allInnerTexts()
const cardPrices = async (page: Page) =>
  (await page.locator('.nft-card .nft-price-row span').allInnerTexts()).map((text) => Number.parseFloat(text.replace(',', '.')))

async function openFilters(page: Page) {
  const toggle = page.getByRole('button', { name: 'Abrir filtros' })
  if (await toggle.isVisible()) await toggle.click()
}

function searchBox(page: Page) {
  return page.locator('input[aria-label="Buscar NFTs"], input[aria-label="Explorar coleções"]').filter({ visible: true })
}

test.describe('catálogo', () => {
  test('busca textual atualiza a URL e filtra os cards', async ({ app, page }) => {
    await app.open('/')
    await expect(page.locator('.nft-card')).toHaveCount(6)
    await searchBox(page).fill('neon')
    await expect(page).toHaveURL(/q=neon/)
    await expect(page.locator('.nft-card').first()).toBeVisible()
    const names = await cardNames(page)
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) expect(name.toLowerCase()).toContain('neon')
  })

  test('busca sem resultados mostra estado vazio e permite limpar', async ({ app, page }) => {
    await app.open('/?q=zzzz-inexistente')
    await expect(page.getByRole('heading', { name: 'Nenhum NFT encontrado' })).toBeVisible()
    await page.getByRole('button', { name: 'Limpar filtros' }).click()
    await expect(page.locator('.nft-card')).toHaveCount(6)
    await expect(page).not.toHaveURL(/q=/)
  })

  test('filtros combinados de coleção e rede ficam na URL', async ({ app, page }) => {
    await app.open('/')
    await expect(page.locator('.nft-card')).toHaveCount(6)
    await openFilters(page)
    await page.locator('.category-filter .filter-row').first().click()
    await expect(page).toHaveURL(/category=/)
    const afterCategory = (await page.locator('.nft-card').count())
    await page.locator('.network-filter .filter-row', { hasText: 'Ethereum' }).click()
    await expect(page).toHaveURL(/network=Ethereum/)
    await expect(page).toHaveURL(/category=/)
    const afterBoth = await page.locator('.nft-card').count()
    expect(afterBoth).toBeLessThanOrEqual(afterCategory)
    await expect(page.locator('.filter-row[aria-pressed=true]')).toHaveCount(2)
  })

  test('ordenação por menor e maior preço', async ({ app, page }) => {
    await app.open('/')
    await expect(page.locator('.nft-card')).toHaveCount(6)
    await page.getByLabel('Ordenar NFTs').selectOption('price-asc')
    await expect(page).toHaveURL(/sort=price-asc/)
    await expect.poll(async () => {
      const prices = await cardPrices(page)
      return prices.length > 1 && prices.every((value, index) => index === 0 || value >= prices[index - 1])
    }).toBe(true)
    await page.getByLabel('Ordenar NFTs').selectOption('price-desc')
    await expect.poll(async () => {
      const prices = await cardPrices(page)
      return prices.length > 1 && prices.every((value, index) => index === 0 || value <= prices[index - 1])
    }).toBe(true)
  })

  test('paginação e restauração pelo histórico do navegador', async ({ app, page }) => {
    await app.open('/')
    await expect(page.locator('.nft-card')).toHaveCount(6)
    const firstPage = await cardNames(page)
    await page.getByRole('button', { name: 'Próxima página' }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect.poll(async () => (await cardNames(page))[0]).not.toBe(firstPage[0])
    const secondPage = await cardNames(page)

    await page.getByLabel('Ordenar NFTs').selectOption('price-desc')
    await expect(page).toHaveURL(/sort=price-desc/)

    await page.goBack()
    await expect(page).toHaveURL(/page=2/)
    await expect(page).not.toHaveURL(/sort=/)
    await expect.poll(() => cardNames(page)).toEqual(secondPage)

    await page.goBack()
    await expect(page).not.toHaveURL(/page=2/)
    await expect.poll(() => cardNames(page)).toEqual(firstPage)

    await page.goForward()
    await expect(page).toHaveURL(/page=2/)
    await expect.poll(() => cardNames(page)).toEqual(secondPage)
  })

  test('link compartilhado restaura filtros, ordenação e página', async ({ app, page }) => {
    await app.open('/?network=Ethereum&sort=price-asc')
    await expect(page.locator('.nft-card').first()).toBeVisible()
    await expect(page.getByLabel('Ordenar NFTs')).toHaveValue('price-asc')
    await openFilters(page)
    await expect(page.locator('.network-filter .filter-row[aria-pressed=true]')).toContainText('Ethereum')
  })

  test('voltar do detalhe preserva a busca', async ({ app, page }) => {
    await app.open('/?q=ape')
    await expect(page.locator('.nft-card').first()).toBeVisible()
    await page.locator('.nft-card .nft-title').first().click()
    await expect(page).toHaveURL(/\/nft\/\d+/)
    await page.goBack()
    await expect(page).toHaveURL(/q=ape/)
    await expect(page.locator('.nft-card').first()).toBeVisible()
  })
})
