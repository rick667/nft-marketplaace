import { expect, test } from './fixtures'

test.describe('estados de carregamento e erro', () => {
  test('skeletons aparecem durante a latência e somem ao carregar', async ({ app, page }) => {
    await page.goto('/?mockScenario=slow')
    await expect(page.getByTestId('nft-skeleton').first()).toBeVisible()
    await expect(page.locator('.nft-card').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('nft-skeleton')).toHaveCount(0)
    await app.waitRealtime('connected')
  })

  test('detalhe mostra estado de carregamento acessível', async ({ app, page }) => {
    await app.open('/?mockScenario=slow')
    await page.goto('/nft/42')
    await expect(page.locator('[aria-busy=true]').first()).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Emerald Ape #042' })).toBeVisible({ timeout: 15_000 })
  })

  test('falha da listagem exibe erro com nova tentativa que recupera', async ({ app, mock, page }) => {
    await app.open('/')
    await expect(page.locator('.nft-card').first()).toBeVisible()
    await mock.fail('GET', '/api/nfts', 503, 10)
    await page.goto('/?q=ape')
    await expect(page.getByRole('heading', { name: 'Não foi possível carregar os NFTs' })).toBeVisible({ timeout: 15_000 })
    await mock.reset()
    await page.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(page.locator('.nft-card').first()).toBeVisible()
  })

  test('falha ao carregar o detalhe oferece nova tentativa', async ({ app, mock, page }) => {
    await app.open('/')
    await mock.fail('GET', '/api/nfts/42', 503, 10)
    await page.goto('/nft/42')
    await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible({ timeout: 15_000 })
    await mock.reset()
    await page.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Emerald Ape #042' })).toBeVisible()
  })

  test('prefers-reduced-motion desativa a animação do skeleton', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/?mockScenario=slow')
    const skeleton = page.getByTestId('nft-skeleton').first()
    await expect(skeleton).toBeVisible()
    const animation = await skeleton.evaluate((element) => getComputedStyle(element, '::after').animationName)
    expect(animation).toBe('none')
    await context.close()
  })
})
