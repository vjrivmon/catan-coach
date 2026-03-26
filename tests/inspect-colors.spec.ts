import { test } from '@playwright/test'

async function clearOnboarding(page) {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 })
  await page.evaluate(() => localStorage.removeItem('catan-onboarding-done'))
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(800)
}

test('inspect color buttons', async ({ page }) => {
  await clearOnboarding(page)
  await page.waitForSelector('.driver-popover', { timeout: 5000 })
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(400)
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(400)
  await page.locator('.driver-popover-next-btn').click()
  await page.waitForFunction(
    () => { const el = document.querySelector('.driver-popover-title'); return el && el.innerText !== 'Tablero interactivo' },
    { timeout: 3000 }
  )
  const info = await page.evaluate(() => {
    const picker = document.querySelector('[data-tour=color-picker]')
    const btns = picker ? picker.querySelectorAll('button') : []
    return Array.from(btns).map(b => ({
      style: b.getAttribute('style'),
      class: b.className.substring(0,50),
      visible: b.offsetParent !== null,
      text: b.innerText
    }))
  })
  console.log('buttons:', JSON.stringify(info, null, 2))
  const driverHighlight = await page.evaluate(() => {
    const el = document.querySelector('[data-tour=color-picker]')
    if (!el) return 'NOT FOUND'
    const style = window.getComputedStyle(el)
    return { zIndex: style.zIndex, position: style.position }
  })
  console.log('driver highlight:', JSON.stringify(driverHighlight))
})