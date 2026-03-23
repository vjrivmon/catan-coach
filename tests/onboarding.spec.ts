import { test, expect } from '@playwright/test'

// Helper: clear localStorage so onboarding shows
async function clearOnboarding(page: any) {
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.removeItem('catan-onboarding-done'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('header', { timeout: 10000 })
  await page.waitForTimeout(500)
}

// Helper: skip onboarding
async function skipOnboarding(page: any) {
  await clearOnboarding(page)
  if (await page.getByText('Bienvenido a Catan Coach').isVisible()) {
    await page.getByText('Saltar tutorial').click()
    await page.waitForTimeout(300)
  }
}

test('OB-1: onboarding shows on first visit', async ({ page }) => {
  await clearOnboarding(page)
  await expect(page.getByText('Bienvenido a Catan Coach')).toBeVisible()
})

test('OB-2: onboarding has 4 steps navigable', async ({ page }) => {
  await clearOnboarding(page)

  // Step 1
  await expect(page.getByText('Bienvenido a Catan Coach')).toBeVisible()
  await page.getByRole('button', { name: 'Siguiente' }).click()

  // Step 2
  await expect(page.getByText('3 formas de empezar')).toBeVisible()
  await expect(page.getByText('Coloca tus piezas y las de los rivales')).toBeVisible()
  await expect(page.getByText('Pregunta sobre reglas y estrategia sin tablero')).toBeVisible()
  await page.getByRole('button', { name: 'Siguiente' }).click()

  // Step 3
  await expect(page.getByText('Reglas de colocación inicial')).toBeVisible()
  await expect(page.getByText('Regla de distancia')).toBeVisible()
  await page.getByRole('button', { name: 'Siguiente' }).click()

  // Step 4
  await expect(page.getByText('Durante la partida')).toBeVisible()
  await expect(page.getByText('Iniciar partida')).toBeVisible()
})

test('OB-3: skip button dismisses onboarding', async ({ page }) => {
  await clearOnboarding(page)
  await expect(page.getByText('Bienvenido a Catan Coach')).toBeVisible()
  await page.getByText('Saltar tutorial').click()
  await expect(page.getByText('Bienvenido a Catan Coach')).not.toBeVisible()
  // Mode selection should now be visible
  await expect(page.getByText('¿Cómo quieres empezar?')).toBeVisible()
})

test('OB-4: Empezar button on last step dismisses onboarding', async ({ page }) => {
  await clearOnboarding(page)
  // Navigate to last step
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Siguiente' }).click()
    await page.waitForTimeout(200)
  }
  await expect(page.getByText('Durante la partida')).toBeVisible()
  await page.getByRole('button', { name: 'Empezar' }).click()
  await expect(page.getByText('Durante la partida')).not.toBeVisible()
})

test('OB-5: onboarding does NOT show on second visit (localStorage)', async ({ page }) => {
  // First visit — complete onboarding
  await clearOnboarding(page)
  await page.getByText('Saltar tutorial').click()
  await page.waitForTimeout(200)

  // Second visit — onboarding should NOT appear
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('header', { timeout: 10000 })
  await page.waitForTimeout(500)
  await expect(page.getByText('Bienvenido a Catan Coach')).not.toBeVisible()
})

test('OB-6: header visible during onboarding', async ({ page }) => {
  await clearOnboarding(page)
  await expect(page.getByRole('heading', { name: 'Catan Coach', exact: true })).toBeVisible()
  await expect(page.getByText('Bienvenido a Catan Coach')).toBeVisible()
})

test('OB-7: back button works', async ({ page }) => {
  await clearOnboarding(page)
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByText('3 formas de empezar')).toBeVisible()
  await page.getByRole('button', { name: 'Anterior' }).click()
  await expect(page.getByText('Bienvenido a Catan Coach')).toBeVisible()
})
