import { test } from '@playwright/test'

test('tour completo paso a paso móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.removeItem('catan-onboarding-done'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.driver-popover', { timeout: 5000 })

  // Paso 1
  await page.screenshot({ path: 'tests/screenshots/tour-paso-1.png' })

  // Paso 2
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(500)
  await page.screenshot({ path: 'tests/screenshots/tour-paso-2.png' })

  // Paso 3
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(500)
  await page.screenshot({ path: 'tests/screenshots/tour-paso-3.png' })

  // Paso 4 — color picker (sin colores asignados, botón bloqueado)
  await page.locator('.driver-popover-next-btn').click()
  await page.waitForFunction(() => { const el = document.querySelector('.driver-popover-title'); return el && el.innerText === 'Elige los colores' }, { timeout: 3000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'tests/screenshots/tour-paso-4a-bloqueado.png' })

  // Paso 4b — después de asignar colores, botón activo
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      const picker = document.querySelector('[data-tour=color-picker]')
      const btn = picker?.querySelector('button[style*=background]') as HTMLButtonElement
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await page.waitForTimeout(350)
  }
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const noBtn = btns.find(b => b.innerText.includes('somos 3') || b.innerText.includes('somos 2'))
    noBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForSelector('[data-tour=colors-done]', { timeout: 3000 })
  await page.waitForTimeout(200)
  await page.screenshot({ path: 'tests/screenshots/tour-paso-4b-activo.png' })

  // Paso 5 — tablero visible
  await page.locator('.driver-popover-next-btn').click()
  await page.waitForFunction(() => { const el = document.querySelector('.driver-popover-title'); return el && el.innerText === 'El tablero de juego' }, { timeout: 3000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'tests/screenshots/tour-paso-5.png' })

  // Paso 6 — chat input
  await page.locator('.driver-popover-next-btn').click()
  await page.waitForFunction(() => { const el = document.querySelector('.driver-popover-title'); return el && el.innerText === 'Pregunta lo que quieras' }, { timeout: 4000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'tests/screenshots/tour-paso-6.png' })
})
