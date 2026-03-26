import { test } from '@playwright/test'

async function clearOnboarding(page: any) {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 })
  await page.evaluate(() => localStorage.removeItem('catan-onboarding-done'))
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(800)
}

test('debug OB-8 timing', async ({ page }) => {
  await clearOnboarding(page)
  await page.waitForSelector('.driver-popover', { timeout: 5000 })
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(400)
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(400)

  // Click siguiente en paso 3 (board-btn) — abre tablero
  await page.locator('.driver-popover-next-btn').click()
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100)
    const visible = await page.locator('.driver-popover').isVisible()
    const title = visible ? await page.locator('.driver-popover-title').innerText().catch(() => 'N/A') : 'HIDDEN'
    console.log('t=' + ((i+1)*100) + 'ms visible=' + visible + ' title=' + title)
    if (visible && title !== 'Tablero interactivo') break
  }
})
