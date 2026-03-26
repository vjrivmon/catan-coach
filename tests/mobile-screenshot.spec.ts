import { test } from '@playwright/test'

test('mobile screenshot tour paso 4 color picker', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.removeItem('catan-onboarding-done'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.driver-popover', { timeout: 5000 })
  // Navigate to step 3 and open board
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(400)
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(400)
  await page.locator('.driver-popover-next-btn').click()
  await page.waitForFunction(
    () => { const el = document.querySelector('.driver-popover-title'); return el && el.innerText === 'Elige tu color' },
    { timeout: 3000 }
  )
  await page.screenshot({ path: 'tests/screenshots/mobile-color-picker.png' })
})
