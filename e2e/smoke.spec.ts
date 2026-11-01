import { expect, test } from '@playwright/test'
import { sampleEpub, samplePdf } from './fixtures'

test('写経とサンプル参照を操作できる', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: '機能' })).toBeVisible()
  await page.getByRole('tab', { name: 'ファイル' }).click()
  await page.getByRole('button', { name: 'ファイル', exact: true }).click()
  await page.locator('.file-controls select').selectOption('select-sql')
  await expect(page.getByRole('main').getByTitle('基本SELECT (SQL)')).toBeVisible()
  await page.locator('.cm-editor .cm-content').last().click()
  await page.keyboard.type('SELECT id FROM products;')
  await expect(page.locator('.cm-editor .cm-content').last()).toContainText('SELECT id FROM products;')
})

test('設定を開閉できる', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '設定' }).click()
  await expect(page.getByRole('region', { name: '設定' })).toBeVisible()
  await page.getByRole('button', { name: 'サイドバーを閉じる' }).click()
  await expect(page.getByRole('region', { name: '設定' })).toHaveCount(0)
})

test('保存の成功と失敗を通知する', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '設定' }).click()
  await page.getByRole('region', { name: '設定' }).getByRole('button', { name: '保存' }).click()
  await expect(page.locator('.snackbar-success')).toContainText('設定を保存しました')

  await page.getByRole('button', { name: '設定' }).click()
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'shakyo.preferences') throw new Error('Storage unavailable')
      return original.call(this, key, value)
    }
  })
  await page.getByRole('region', { name: '設定' }).getByRole('button', { name: '保存' }).click()
  await expect(page.locator('.snackbar-error')).toContainText('設定を保存できませんでした')
})

test('ショートカットを変更し、検索操作に反映する', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ショートカット' }).click()
  const dialog = page.getByRole('dialog', { name: 'ショートカット' })
  await dialog.getByRole('textbox', { name: '検索のショートカット' }).press('Control+Alt+k')
  await expect(dialog.getByRole('textbox', { name: '検索のショートカット' })).toHaveValue('Ctrl / Cmd + Alt + k')
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(page.locator('.snackbar-success')).toContainText('ショートカットを保存しました')
  await page.locator('.shakyo-code .cm-content').click()
  await page.keyboard.press('Control+Alt+k')
  await expect(page.locator('.shakyo-code .cm-search')).toBeVisible()
})

test('レイアウトとペイン表示を切り替え、保存内容を復元する', async ({ page }) => {
  await page.goto('/')
  await page.locator('.shakyo-code .cm-content').click()
  await page.keyboard.type('const value = 1')
  await page.getByRole('button', { name: 'レイアウト' }).click()
  const layout = page.getByRole('region', { name: 'レイアウト' })
  await layout.getByRole('combobox', { name: '分割パターン' }).selectOption('editorOnly')
  await layout.getByRole('button', { name: '適用' }).click()
  await expect(page.getByRole('tab', { name: 'ファイル' })).toHaveCount(0)
  await expect(page.locator('.shakyo-code .cm-content')).toContainText('const value = 1')
  await page.getByRole('button', { name: 'レイアウト' }).click()
  await layout.getByRole('button', { name: '初期配置に戻す' }).click()
  await layout.getByRole('button', { name: '適用' }).click()
  await expect(page.getByRole('tab', { name: 'ファイル' })).toBeVisible()
  await expect(page.locator('.shakyo-code .cm-content')).toContainText('const value = 1')
})

test('AIモデルと解説の深さを保存する', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '設定' }).click()
  const settings = page.getByRole('region', { name: '設定' })
  await settings.getByLabel('モデル', { exact: true }).selectOption('gpt-5.6-terra')
  await settings.getByText('詳細設定', { exact: true }).click()
  await settings.getByLabel('解説の深さ', { exact: true }).selectOption('medium')
  await settings.getByRole('button', { name: '保存' }).click()
  await page.getByRole('button', { name: '設定' }).click()
  await expect(settings.getByLabel('モデル', { exact: true })).toHaveValue('gpt-5.6-terra')
  await settings.getByText('詳細設定', { exact: true }).click()
  await expect(settings.getByLabel('解説の深さ', { exact: true })).toHaveValue('medium')
})

test('PDFを閉じて開き直し、目次とページ移動を操作する', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '設定' }).click()
  await page.getByRole('region', { name: '設定' }).getByRole('checkbox', { name: 'リーディングモード' }).check()
  await page.getByRole('region', { name: '設定' }).getByRole('button', { name: '保存' }).click()
  const input = page.locator('input[type="file"][aria-label="お手本ファイル"]')
  const file = { name: 'smoke.pdf', mimeType: 'application/pdf', buffer: samplePdf() }
  await input.setInputFiles(file)
  await expect(page.locator('.pdf-viewer').getByLabel('現在のページ')).toHaveText('1 / 2')
  await page.locator('.pdf-viewer').hover()
  await page.locator('.pdf-viewer').getByRole('button', { name: '目次' }).click()
  await page.getByRole('navigation', { name: '文書の目次' }).getByRole('button', { name: 'Second' }).click()
  await expect(page.locator('.pdf-viewer').getByLabel('現在のページ')).toHaveText('2 / 2')
  await page.getByRole('main').getByRole('button', { name: 'ファイルを閉じる' }).click()
  await expect(page.locator('.pdf-viewer')).toHaveCount(0)
  await input.setInputFiles(file)
  await expect(page.locator('.pdf-viewer').getByLabel('現在のページ')).toHaveText('1 / 2')
})

test('EPUBを閉じて開き直し、章移動を操作する', async ({ page }) => {
  await page.goto('/')
  const input = page.locator('input[type="file"][aria-label="お手本ファイル"]')
  const file = { name: 'smoke.epub', mimeType: 'application/epub+zip', buffer: sampleEpub() }
  await input.setInputFiles(file)
  await expect(page.locator('.epub-viewer')).toBeVisible()
  await expect(page.frameLocator('.epub-rendition iframe[srcdoc*="EPUB smoke text"]').locator('body')).toContainText('EPUB smoke text')
  await page.frameLocator('.epub-rendition iframe[srcdoc*="EPUB smoke text"]').getByRole('link', { name: '次の章' }).click()
  await expect(page.locator('.epub-rendition iframe[srcdoc*="EPUB second text"]')).toBeInViewport()
  await page.getByRole('combobox', { name: '章節を移動' }).selectOption({ label: '第二章' })
  await expect(page.frameLocator('.epub-rendition iframe[srcdoc*="EPUB second text"]').locator('body')).toContainText('EPUB second text')
  await page.getByRole('main').getByRole('button', { name: 'ファイルを閉じる' }).click()
  await expect(page.locator('.epub-viewer')).toHaveCount(0)
  await input.setInputFiles(file)
  await expect(page.frameLocator('.epub-rendition iframe[srcdoc*="EPUB smoke text"]').locator('body')).toContainText('EPUB smoke text')
})
