import { test, expect } from '@playwright/test'

async function clearOnboarding(page: any) {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 })
  await page.evaluate(() => localStorage.removeItem('catan-onboarding-done'))
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(800)
}

test('OB-1: tour shows popover on first visit', async ({ page }) => {
  await clearOnboarding(page)
  // driver.js renders .driver-popover in body
  await expect(page.locator('.driver-popover')).toBeVisible({ timeout: 5000 })
})

test('OB-2: first step title is Catan Coach', async ({ page }) => {
  await clearOnboarding(page)
  await page.waitForSelector('.driver-popover', { timeout: 5000 })
  const title = await page.locator('.driver-popover-title').innerText()
  expect(title).toBe('Catan Coach')
})

test('OB-3: next advances to mode-select step', async ({ page }) => {
  await clearOnboarding(page)
  await page.waitForSelector('.driver-popover', { timeout: 5000 })
  await page.locator('.driver-popover-next-btn').click()
  await page.waitForTimeout(400)
  const title = await page.locator('.driver-popover-title').innerText()
  expect(title).toBe('¿Cómo quieres empezar?')
})

test('OB-4: can navigate first 3 steps without board interaction', async ({ page }) => {
  await clearOnboarding(page)
  await page.waitForSelector('.driver-popover', { timeout: 5000 })
  const expectedTitles = [
    'Catan Coach',
    '¿Cómo quieres empezar?',
    'Tablero interactivo',
  ]
  for (let i = 0; i < expectedTitles.length; i++) {
    const title = await page.locator('.driver-popover-title').innerText()
    expect(title).toBe(expectedTitles[i])
    if (i < expectedTitles.length - 1) {
      await page.locator('.driver-popover-next-btn').click()
      await page.waitForTimeout(400)
    }
  }
})

test('OB-5: close button dismisses tour', async ({ page }) => {
  await clearOnboarding(page)
  await page.waitForSelector('.driver-popover', { timeout: 5000 })
  // Use close button — works at any step without needing to open the board
  await page.locator('.driver-popover-close-btn').click()
  await page.waitForTimeout(400)
  await expect(page.locator('.driver-popover')).not.toBeVisible()
})

test('OB-6: tour does NOT show on second visit', async ({ page }) => {
  await clearOnboarding(page)
  await page.waitForSelector('.driver-popover', { timeout: 5000 })
  // Close it
  await page.locator('.driver-popover-close-btn').click()
  await page.waitForTimeout(300)
  // Reload
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(800)
  await expect(page.locator('.driver-popover')).not.toBeVisible()
})

test('OB-7: previous button goes back', async ({ page }) => {
  await clearOnboarding(page)
  await page.waitForSelector('.driver-popover', { timeout: 5000 })
  await page.locator('.driver-popover-next-btn').click()
  await page.waitForTimeout(400)
  expect(await page.locator('.driver-popover-title').innerText()).toBe('¿Cómo quieres empezar?')
  await page.locator('.driver-popover-prev-btn').click()
  await page.waitForTimeout(400)
  expect(await page.locator('.driver-popover-title').innerText()).toBe('Catan Coach')
})

test('OB-8: tour llega al ultimo paso sin romperse', async ({ page }) => {
  await clearOnboarding(page)
  await page.waitForSelector('.driver-popover', { timeout: 5000 })
  // Step 1→2→3
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(400)
  await page.locator('.driver-popover-next-btn').click(); await page.waitForTimeout(400)
  expect(await page.locator('.driver-popover-title').innerText()).toBe('Tablero interactivo')
  // Step 3→4: opens board, shows color picker
  await page.locator('.driver-popover-next-btn').click()
  await page.waitForFunction(
    () => { const el = document.querySelector('.driver-popover-title'); return el && el.innerText !== 'Tablero interactivo' },
    { timeout: 3000 }
  )
  expect(await page.locator('.driver-popover-title').innerText()).toBe('Elige los colores')
  // Try to advance without assigning colors — should be blocked
  await page.locator('.driver-popover-next-btn').click()
  await page.waitForTimeout(400)
  expect(await page.locator('.driver-popover-title').innerText()).toBe('Elige los colores')
  // Assign colors using dispatchEvent to bypass driver.js overlay
  for (let attempt = 0; attempt < 4; attempt++) {
    const clicked = await page.evaluate(() => {
      const picker = document.querySelector('[data-tour=color-picker]')
      if (!picker) return false
      const btn = picker.querySelector('button[style*=background]')
      if (!btn) return false
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      return true
    })
    if (!clicked) break
    await page.waitForTimeout(350)
  }
  // Wait for colors-done to appear (may need to confirm J4 step)
  await page.evaluate(() => {
    // Handle 'No (somos 3)' button if J4 step appears
    const btns = Array.from(document.querySelectorAll('button'))
    const noBtn = btns.find(b => b.innerText.includes('No (somos 3)') || b.innerText.includes('somos 2'))
    if (noBtn) noBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await page.waitForTimeout(300)
  await page.waitForSelector('[data-tour=colors-done]', { timeout: 3000 })
  // Now Siguiente should work
  await page.locator('.driver-popover-next-btn').click()
  await page.waitForFunction(
    () => { const el = document.querySelector('.driver-popover-title'); return el && el.innerText === 'El tablero de juego' },
    { timeout: 3000 }
  )
  expect(await page.locator('.driver-popover-title').innerText()).toBe('El tablero de juego')
  // Step 5→6: closes board, chat input
  await page.locator('.driver-popover-next-btn').click()
  await page.waitForFunction(
    () => { const el = document.querySelector('.driver-popover-title'); return el && el.innerText === 'Pregunta lo que quieras' },
    { timeout: 3000 }
  )
  expect(await page.locator('.driver-popover-title').innerText()).toBe('Pregunta lo que quieras')
})
