import { test } from '@playwright/test'

test('screenshot paso 5 tablero visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.removeItem('catan-onboarding-done'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.driver-popover', { timeout: 5000 })
  // Steps 1→2→3
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(400)
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(400)
  await page.locator('.driver-popover-next-btn').click()
  await page.waitForFunction(() => { const el = document.querySelector('.driver-popover-title'); return el && el.innerText === 'Elige los colores' }, { timeout: 3000 })
  // Assign colors
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      const picker = document.querySelector('[data-tour=color-picker]')
      const btn = picker?.querySelector('button[style*=background]') as HTMLButtonElement
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await page.waitForTimeout(300)
  }
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const noBtn = btns.find(b => b.innerText.includes('somos 3') || b.innerText.includes('somos 2'))
    noBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForSelector('[data-tour=colors-done]', { timeout: 3000 })
  await page.locator('.driver-popover-next-btn').click()
  await page.waitForFunction(() => { const el = document.querySelector('.driver-popover-title'); return el && el.innerText === 'El tablero de juego' }, { timeout: 3000 })
  await page.screenshot({ path: 'tests/screenshots/step5-board.png' })
})
