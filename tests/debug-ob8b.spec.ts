import { test } from '@playwright/test'

async function clearOnboarding(page: any) {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 })
  await page.evaluate(() => localStorage.removeItem('catan-onboarding-done'))
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(800)
}

test('debug OB-8 board opens', async ({ page }) => {
  await clearOnboarding(page)
  await page.waitForSelector('.driver-popover', { timeout: 5000 })
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(400)
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(400)

  // Click siguiente en paso 3 — should open board
  await page.locator('.driver-popover-next-btn').click()
  await page.waitForTimeout(800)

  // Check board opened
  const boardOverlay = await page.locator('[data-tour="board-overlay"]').isVisible().catch(() => false)
  const boardBtn = await page.locator('[data-tour="board-btn"]').isVisible().catch(() => false)
  const popoverVisible = await page.locator('.driver-popover').isVisible()
  const popoverTitle = popoverVisible ? await page.locator('.driver-popover-title').innerText().catch(() => 'N/A') : 'HIDDEN'
  console.log('boardOverlay visible:', boardOverlay)
  console.log('boardBtn visible:', boardBtn)
  console.log('popover:', popoverVisible, popoverTitle)
  
  // Check all data-tour elements
  const allTour = await page.evaluate(() => {
    const els = document.querySelectorAll('[data-tour]')
    return Array.from(els).map(el => ({
      attr: el.getAttribute('data-tour'),
      visible: (el as HTMLElement).offsetParent !== null
    }))
  })
  console.log('data-tour elements:', JSON.stringify(allTour))
})
