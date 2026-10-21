import { expect, test } from './fixtures'

test.describe('teclado, foco e formulários', () => {
  test('modal de login prende o foco, fecha com Escape e devolve o foco', async ({ app, page }) => {
    await app.open('/')
    const trigger = page.getByRole('button', { name: 'Entrar' }).filter({ visible: true }).first()
    await trigger.focus()
    await page.keyboard.press('Enter')
    const dialog = app.dialog()
    await expect(dialog).toBeVisible()
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog]')))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test('o modal tem nome acessível e campos rotulados', async ({ app }) => {
    await app.open('/profile')
    const dialog = app.dialog()
    await expect(dialog).toHaveAccessibleName(/.+/)
    await expect(dialog.getByLabel('E-mail')).toBeVisible()
    await expect(dialog.getByLabel('Senha', { exact: true })).toBeVisible()
  })

  test('foco visível em elementos interativos', async ({ app, page }) => {
    await app.open('/')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    const outline = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement as Element)
      return { width: style.outlineWidth, style: style.outlineStyle, shadow: style.boxShadow }
    })
    expect(outline.style !== 'none' || outline.shadow !== 'none').toBe(true)
  })

  test('cards do catálogo são operáveis só pelo teclado', async ({ app, page }) => {
    await app.open('/')
    await expect(page.locator('.nft-card').first()).toBeVisible()
    const open = page.locator('.nft-card .nft-image').first()
    await open.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/nft\/\d+/)
    await page.getByRole('button', { name: 'Aumentar quantidade' }).focus()
    await page.keyboard.press('Space')
    await expect(page.locator('.detail-quantity > span').filter({ visible: true })).toHaveText('2')
  })

  test('abas do catálogo expõem estado selecionado', async ({ app, page }) => {
    await app.open('/')
    const tab = page.getByRole('tab', { name: 'Em alta' })
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/tab=trending/)
  })

  test('formulário de pagamento valida e-mail inválido', async ({ app, page }) => {
    await app.open('/nft/42')
    await page.getByRole('button', { name: 'COMPRAR' }).click()
    await expect(page.getByRole('link', { name: /Abrir carrinho, 1 NFTs/ })).toBeVisible()
    await app.login(undefined, '/payment')
    await page.locator('[name="email"]').fill('email-invalido')
    await expect(page.locator('[name="email"]')).toHaveJSProperty('validity.typeMismatch', true)
  })
})
