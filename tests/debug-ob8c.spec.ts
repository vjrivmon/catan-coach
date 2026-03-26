import { test } from '@playwright/test'

async function clearOnboarding(page) {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 })
  await page.evaluate(() => localStorage.removeItem('catan-onboarding-done'))
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(800)
}

test('debug step3 full poll', async ({ page }) => {
  await clearOnboarding(page)
  await page.waitForSelector('.driver-popover', { timeout: 5000 })
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(400)
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(400)
  await page.locator('.driver-popover-next-btn').click()
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100)
    const state = await page.evaluate(() => {
      const popover = document.querySelector('.driver-popover')
      const title = popover ? document.querySelector('.driver-popover-title').innerText : null
      return { has: !!popover, title }
    })
    console.log('t=' + ((i+1)*100) + ' ' + JSON.stringify(state))
  }
})