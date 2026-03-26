import { test } from '@playwright/test'

test('screenshot botones tour paso 2 y 3', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('catan-onboarding-done'))
  await page.reload()
  await page.waitForSelector('.driver-popover', { timeout: 5000 })
  await page.screenshot({ path: 'tests/screenshots/step1.png', fullPage: false })

  await page.click('.driver-popover-next-btn')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'tests/screenshots/step2.png', fullPage: false })

  await page.click('.driver-popover-next-btn')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'tests/screenshots/step3.png', fullPage: false })
})
