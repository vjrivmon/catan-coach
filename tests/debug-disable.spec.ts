import { test, expect } from '@playwright/test'

async function clearOnboarding(page) {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 })
  await page.evaluate(() => localStorage.removeItem('catan-onboarding-done'))
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(800)
}

test('verify next btn disabled state on step 4', async ({ page }) => {
  await clearOnboarding(page)
  await page.waitForSelector('.driver-popover', { timeout: 5000 })
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(400)
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(400)
  await page.locator('.driver-popover-next-btn').click()
  await page.waitForFunction(() => { const el = document.querySelector('.driver-popover-title'); return el && el.innerText === 'Elige los colores' }, { timeout: 3000 })
  await page.waitForTimeout(300)

  const state = await page.evaluate(() => {
    const btn = document.querySelector('.driver-popover-next-btn') as HTMLButtonElement
    const bodyClass = document.body.className
    const computed = window.getComputedStyle(btn)
    return {
      bodyHasClass: bodyClass.includes('tour-colors-pending'),
      opacity: computed.opacity,
      cursor: computed.cursor,
      pointerEvents: computed.pointerEvents,
      background: computed.backgroundColor
    }
  })
  console.log('BTN STATE:', JSON.stringify(state, null, 2))
})