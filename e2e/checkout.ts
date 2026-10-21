import { expect, type Page } from '@playwright/test'
import type { App } from './fixtures'

export function cartCounter(page: Page, count: number) {
  return page
    .getByRole('link', { name: new RegExp(`Abrir carrinho, ${count} NFTs`) })
    .or(page.getByRole('button', { name: new RegExp(`Ir para o carrinho, ${count} NFTs`) }))
    .filter({ visible: true })
    .first()
}

export async function addToCart(app: App, page: Page, nftId = 42, quantity = 1) {
  await app.open(`/nft/${nftId}`)
  for (let index = 1; index < quantity; index += 1) {
    await page.getByRole('button', { name: 'Aumentar quantidade' }).filter({ visible: true }).first().click()
  }
  await page.locator('.detail-buy-button, .detail-mobile-buybar > button:not(.detail-mobile-cart)').filter({ visible: true }).first().click()
  await expect(cartCounter(page, quantity)).toBeVisible()
}

export function submitButton(page: Page) {
  return page.locator('.payment-submit-desktop, .payment-mobile-checkout button').filter({ visible: true })
}

export async function fillCollector(page: Page, overrides: Record<string, string> = {}) {
  const firstField = page.locator('[name="displayName"]')
  if (!(await firstField.isVisible())) await page.getByRole('button', { name: 'Dados do colecionador' }).click()
  await expect(firstField).toBeVisible()
  const values: Record<string, string> = {
    displayName: 'Maria Colecionadora',
    username: 'maria_col',
    profileName: 'Maria Col',
    walletAddress: '0x7A4219E8c0ffee00000000000000000000001234',
    referralCode: 'KURIO-FRIEND',
    email: 'maria@kurio.app',
    ensName: 'maria',
    ...overrides,
  }
  for (const [name, value] of Object.entries(values)) await page.locator(`[name="${name}"]`).fill(value)
  await page.locator('[name="network"]').selectOption({ index: 1 })
  await page.locator('[name="walletType"]').selectOption({ index: 1 })
}

// Preenche o formulário e leva o pedido até a etapa de revisão.
export async function reviewOrder(page: Page, overrides: Record<string, string> = {}) {
  await fillCollector(page, overrides)
  await submitButton(page).click()
  await expect(page.locator('.payment-review')).toBeVisible({ timeout: 15_000 })
  await expect(submitButton(page)).toContainText(/Confirmar/)
}
