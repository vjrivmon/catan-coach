import { test } from '@playwright/test'

test('inspect footer HTML', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('catan-onboarding-done'))
  await page.reload()
  await page.waitForSelector('.driver-popover', { timeout: 5000 })
  await page.click('.driver-popover-next-btn')
  await page.waitForTimeout(500)
  const footerHTML = await page.locator('.driver-popover-footer').innerHTML()
  console.log('FOOTER:' + footerHTML)
})
