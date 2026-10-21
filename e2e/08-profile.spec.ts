import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

// PNG 1x1 válido
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

test.describe('perfil e carteiras', () => {
  async function completeRequired(page: Page) {
    const ens = page.getByLabel('Nome ENS', { exact: true })
    if (!(await ens.inputValue())) await ens.fill('colecionador')
    const nickname = page.getByLabel('Apelido da carteira')
    if (!(await nickname.inputValue())) await nickname.fill('Principal')
  }

  test('edita o perfil e persiste após recarregar', async ({ app, page }) => {
    await app.login()
    await expect(page.getByRole('heading', { name: 'Perfil do colecionador' })).toBeVisible()
    const name = page.getByLabel('Nome de exibição')
    await name.fill('Colecionador Atualizado')
    await completeRequired(page)
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Perfil atualizado' })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Nome de exibição')).toHaveValue('Colecionador Atualizado')
  })

  test('campo obrigatório vazio bloqueia o envio', async ({ app, page }) => {
    await app.login()
    await page.getByLabel('Nome de exibição').fill('')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByLabel('Nome de exibição')).toHaveJSProperty('validity.valueMissing', true)
    await expect(page.getByRole('status').filter({ hasText: 'Perfil atualizado' })).toHaveCount(0)
  })

  test('avatar aceita imagem válida e rejeita arquivo inválido', async ({ app, page }) => {
    await app.login()
    const input = page.getByLabel('Selecionar imagem para o avatar')
    await input.setInputFiles({ name: 'texto.txt', mimeType: 'text/plain', buffer: Buffer.from('nao e imagem') })
    await expect(page.locator('.profile-feedback-error')).toContainText('PNG, JPEG, WEBP ou GIF')
    await input.setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png })
    await expect(page.locator('.profile-feedback-error')).toHaveCount(0)
    await expect(page.getByLabel('Prévia do avatar').locator('img')).toBeVisible()
    await input.setInputFiles({ name: 'grande.png', mimeType: 'image/png', buffer: Buffer.alloc(1_200_000, 1) })
    await expect(page.locator('.profile-feedback-error')).toContainText('1 MB')
  })

  test('troca de senha valida regras e funciona de ponta a ponta', async ({ app, page }) => {
    const user = { email: `senha-${Date.now()}@kurio.app`, password: 'SenhaAtual123!' }
    await app.open('/profile')
    const dialog = app.dialog()
    await dialog.locator('#auth-register-tab').click()
    await dialog.getByLabel('Nome de usuário').fill('Trocador')
    await dialog.getByLabel('E-mail').fill(user.email)
    await dialog.getByLabel('Senha', { exact: true }).fill(user.password)
    await dialog.getByLabel('Confirmar senha').fill(user.password)
    await dialog.locator('form button[type=submit]').click()
    await expect(app.dialog()).toHaveCount(0)
    await completeRequired(page)

    await page.getByLabel('Nova senha', { exact: true }).fill('NovaSenha456!')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.locator('.profile-feedback-error')).toContainText('senha atual')

    await page.getByLabel('Senha atual', { exact: true }).fill('SenhaErrada000')
    await page.getByLabel('Confirmar nova senha', { exact: true }).fill('Diferente789!')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.locator('.profile-feedback-error')).toContainText('confirmação')

    await page.getByLabel('Confirmar nova senha', { exact: true }).fill('NovaSenha456!')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.locator('.profile-feedback-error')).toBeVisible()

    await page.getByLabel('Senha atual', { exact: true }).fill(user.password)
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'senha atualizados' })).toBeVisible()

    await page.getByRole('button', { name: 'Mostrar nova senha' }).click()
    await expect(page.getByLabel('Nova senha', { exact: true })).toHaveAttribute('type', 'text')
  })

  test('carteiras exigem sessão e exibem principal e secundária', async ({ app, page }) => {
    await app.open('/wallets')
    await expect(app.dialog()).toBeVisible()
    await app.dialog().getByLabel('Senha', { exact: true }).fill('KurioDemo123!')
    await app.dialog().locator('form button[type=submit]').click()
    await expect(page.getByRole('heading', { name: 'Carteira principal' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Carteira secundária' })).toBeVisible()
  })
})
