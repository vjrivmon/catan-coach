import { test, expect, Page } from '@playwright/test'

const BASE = 'http://localhost:3000'

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function waitForApp(page: Page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  // Wait for React hydration — header title is the first stable element
  await page.waitForSelector('h1, header', { timeout: 10_000 })
  // Extra tick for client-side state to settle
  await page.waitForTimeout(500)
}

// ─── 1. Landing: 3 mode-selection options visible ────────────────────────────
test('landing shows 3 mode options before any interaction', async ({ page }) => {
  await waitForApp(page)

  await expect(page.getByText('¿Cómo quieres empezar?')).toBeVisible()
  await expect(page.getByText('Escanear tablero')).toBeVisible()
  await expect(page.getByText('Tablero interactivo')).toBeVisible()
  await expect(page.getByText('Solo dudas')).toBeVisible()
})

// ─── 2. Input disabled until mode selected ───────────────────────────────────
test('chat input is disabled until mode is selected', async ({ page }) => {
  await waitForApp(page)

  const textarea = page.locator('textarea')
  await expect(textarea).toBeDisabled()
  await expect(textarea).toHaveAttribute('placeholder', 'Elige una opción para empezar')
})

// ─── 3. "Solo dudas" activates chat ──────────────────────────────────────────
test('"Solo dudas" enables chat immediately', async ({ page }) => {
  await waitForApp(page)

  await page.getByText('Solo dudas').click()

  // Mode selection screen gone
  await expect(page.getByText('¿Cómo quieres empezar?')).not.toBeVisible()

  // Input now enabled
  const textarea = page.locator('textarea')
  await expect(textarea).toBeEnabled()
  await expect(textarea).toHaveAttribute('placeholder', 'Pregunta sobre Catan...')
})

// ─── 4. Header always visible (logo + title) ─────────────────────────────────
test('header is visible on landing', async ({ page }) => {
  await waitForApp(page)
  await expect(page.getByText('Catan Coach')).toBeVisible()
})

// ─── 5. Hex icon always visible in header ────────────────────────────────────
test('hex icon button is always present in header', async ({ page }) => {
  await waitForApp(page)
  // The hex icon button with title
  const hexBtn = page.locator('button[title="Opciones de partida"]')
  await expect(hexBtn).toBeVisible()
})

// ─── 6. "Tablero interactivo" opens board inside chat area (header visible) ──
test('board opens inside chat area — header remains visible', async ({ page }) => {
  await waitForApp(page)

  await page.getByText('Tablero interactivo').click()

  // Header still visible
  await expect(page.getByText('Catan Coach')).toBeVisible()

  // Color assignment step visible
  await expect(page.getByText('¿Tu color?')).toBeVisible()
})

// ─── 7. Color assignment flow — 2 players ────────────────────────────────────
test('color assignment: pick Tú color, then skip at J2 step (somos 2)', async ({ page }) => {
  await waitForApp(page)
  await page.getByText('Tablero interactivo').click()

  // Pick red for Tú (step 0)
  const colorCircles = page.locator('button.rounded-full.border-2.border-stone-600')
  await colorCircles.first().click()

  // Now at J2 step — "No hay J3 ni J4 (somos 2)" link appears here
  await expect(page.getByText('¿Color de J2?')).toBeVisible()
  await expect(page.getByText('No hay J3 ni J4 (somos 2)')).toBeVisible()

  // Skip to 2 players from J2 step
  await page.getByText('No hay J3 ni J4 (somos 2)').click()

  // Should now show player selector and piece selector
  await expect(page.getByText('Pueblo')).toBeVisible()
  await expect(page.getByText('Camino')).toBeVisible()
})

// ─── 8. City button NOT present in piece selector ────────────────────────────
test('city piece type is not available in initial phase', async ({ page }) => {
  await waitForApp(page)
  await page.getByText('Tablero interactivo').click()

  // Pick Tú color, then skip at J2 step
  const colorCircles = page.locator('button.rounded-full.border-2.border-stone-600')
  await colorCircles.first().click()
  await page.getByText('No hay J3 ni J4 (somos 2)').click()

  // No "Ciudad" button in the piece selector
  await expect(page.getByRole('button', { name: 'Ciudad' })).not.toBeVisible()

  // Explanatory text present
  await expect(page.getByText('Ciudad: no disponible en colocación inicial')).toBeVisible()
})

// ─── 9. Confirm button disabled before all pieces placed ─────────────────────
test('confirm button is disabled when not all pieces placed', async ({ page }) => {
  await waitForApp(page)
  await page.getByText('Tablero interactivo').click()

  // Pick Tú color, then skip at J2 step
  const colorCircles = page.locator('button.rounded-full.border-2.border-stone-600')
  await colorCircles.first().click()
  await page.getByText('No hay J3 ni J4 (somos 2)').click()

  // Confirm button should be disabled
  const confirmBtn = page.getByRole('button', { name: /Faltan piezas/ })
  await expect(confirmBtn).toBeVisible()
  await expect(confirmBtn).toBeDisabled()
})

// ─── 10. Hex icon re-opens options when in text-only mode ────────────────────
test('hex icon shows options modal when no board configured', async ({ page }) => {
  await waitForApp(page)

  // Enter solo-dudas mode
  await page.getByText('Solo dudas').click()

  // Click hex icon
  const hexBtn = page.locator('button[title="Opciones de partida"]')
  await hexBtn.click()

  // Options modal appears (slideUp sheet)
  await expect(page.getByText('¿Cómo quieres empezar?')).toBeVisible()
})

// ─── 11. New conversation resets to mode selection ───────────────────────────
test('new conversation resets mode selection screen', async ({ page }) => {
  await waitForApp(page)

  // Select solo-dudas
  await page.getByText('Solo dudas').click()
  await expect(page.locator('textarea')).toBeEnabled()

  // Open sidebar and start new conversation
  await page.locator('button[aria-label="Abrir historial"]').click()
  await page.getByText('Nueva conversación').click()

  // Should show mode selection again
  await expect(page.getByText('¿Cómo quieres empezar?')).toBeVisible()
  await expect(page.locator('textarea')).toBeDisabled()
})
