/**
 * E2E Full Flow — Arquitectura Hexagonal con Agentes Especializados
 *
 * Flujo completo del usuario:
 * 1. Tablero interactivo → colocar piezas
 * 2. Confirmar tablero → selector recursos
 * 3. Confirmar recursos → pregunta automática "¿mejor jugada?"
 * 4. Respuesta con botón "Ver en tablero"
 * 5. Iniciar partida → dado
 * 6. Introducir dado → recursos actualizados → pregunta automática
 * 7. Respuesta con botón "Ver en tablero"
 */

import { test, expect, Page } from '@playwright/test'

const BASE = 'http://localhost:3000'

// LLM responses can take time
test.setTimeout(120_000)

async function waitForApp(page: Page) {
  // Skip onboarding tour
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.setItem('catan-onboarding-done', '1'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('header', { timeout: 10_000 })
  await page.waitForTimeout(500)
}

/**
 * Color assignment: Tú=red, skip J2+ (somos 2 — only Tú places pieces)
 */
async function setupColorsSimple(page: Page) {
  const colorCircles = page.locator('[data-tour="color-picker"] button.rounded-full')
  await expect(colorCircles.first()).toBeVisible({ timeout: 5000 })
  await colorCircles.first().click()
  await page.waitForTimeout(300)

  // At J2 step, click "somos 2" to skip
  await page.getByText('No hay J3 ni J4 (somos 2)').click()
  await page.waitForTimeout(500)
}

/** Place a settlement on a vertex via dispatchEvent (SVG hint circles block normal clicks) */
async function placeSettlement(page: Page, vertexId: number) {
  const puebloBtn = page.locator('button').filter({ hasText: /Pueblo/ })
  if (await puebloBtn.count() > 0 && await puebloBtn.first().isVisible()) {
    await puebloBtn.first().click()
    await page.waitForTimeout(200)
  }
  await page.evaluate((id) => {
    const g = document.querySelector(`g[data-vertex-id="${id}"]`)
    if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }, vertexId)
  await page.waitForTimeout(300)
}

/** Place a road on an edge via dispatchEvent */
async function placeRoad(page: Page, edgeId: string) {
  const caminoBtn = page.locator('button').filter({ hasText: /Camino/ })
  if (await caminoBtn.count() > 0 && await caminoBtn.first().isVisible()) {
    await caminoBtn.first().click()
    await page.waitForTimeout(200)
  }
  await page.evaluate((id) => {
    const g = document.querySelector(`g[data-edge-id="${id}"]`)
    if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }, edgeId)
  await page.waitForTimeout(300)
}

/**
 * Wait for the LLM streaming to complete.
 * Phase 1: Wait for typing indicator to appear (loading started).
 * Phase 2: Wait for typing indicator to disappear (streaming finished).
 */
async function waitForLLMResponse(page: Page, timeoutMs = 90_000) {
  // Phase 1: Wait for typing dots or streaming content to appear
  try {
    await page.locator('span.animate-bounce').first().waitFor({ state: 'visible', timeout: 15_000 })
  } catch {
    // Dots might have already appeared and disappeared (fast response), or streaming started directly
    await page.waitForTimeout(2000)
  }

  // Phase 2: Wait for typing dots to disappear (streaming complete)
  await page.locator('span.animate-bounce').first().waitFor({ state: 'hidden', timeout: timeoutMs })
  await page.waitForTimeout(2000)
}

/**
 * Full board setup helper: open board, set colors, place Tú's 2 settlements + 2 roads
 */
async function setupBoardWithPieces(page: Page) {
  await page.getByText('Tablero interactivo').click()
  await setupColorsSimple(page)

  // Board SVG should be visible
  await expect(page.locator('svg').first()).toBeVisible({ timeout: 5000 })

  // Place 2 settlements + 4 roads for Tú (only player in "somos 2" mode)
  // Vertices 15 and 10, with roads connecting to adjacent vertices
  await placeSettlement(page, 15)
  await placeSettlement(page, 10)
  // Roads from settlement 15: 14_15, 15_16
  await placeRoad(page, '14_15')
  await placeRoad(page, '15_16')
  // Roads from settlement 10: 10_11, 10_13
  await placeRoad(page, '10_11')
  await placeRoad(page, '10_13')
}

/**
 * Confirm board + set resources + wait for auto-question response
 */
async function confirmBoardAndResources(page: Page) {
  // Confirm board
  const confirmBoardBtn = page.locator('[data-tour="confirm-board-btn"]')
  await expect(confirmBoardBtn).toBeEnabled({ timeout: 5000 })
  await confirmBoardBtn.click()
  await page.waitForTimeout(1500)

  // Resource stepper: click + for wood and clay (first 2 resources)
  const plusBtns = page.locator('button').filter({ hasText: '+' })
  // wood is first +
  await plusBtns.first().click()
  await page.waitForTimeout(200)
  // clay is second +
  await plusBtns.nth(1).click()
  await page.waitForTimeout(200)

  // Confirm resources
  const confirmResBtn = page.locator('button').filter({ hasText: /Confirmar.*carta|Pedir recomendación/ })
  await expect(confirmResBtn.first()).toBeVisible({ timeout: 5000 })
  await confirmResBtn.first().click()

  // Wait for auto-question + LLM response
  await waitForLLMResponse(page)
}

// ─── TEST 1: Full board → resources → auto question with recommendation ──────
test('full flow: board setup → resources → auto question with recommendation', async ({ page }) => {
  await waitForApp(page)
  await setupBoardWithPieces(page)
  await confirmBoardAndResources(page)

  // Debug: screenshot and button text dump
  await page.screenshot({ path: '/tmp/catan-test-flow.png' })
  const allBtnTexts = await page.locator('button').allInnerTexts()
  console.log('All button texts:', allBtnTexts.filter(t => t.length > 5))

  // Check for "Ver en tablero" button — the KEY test
  // BoardRecommendationBuilder generates this deterministically from GeneticResult
  const verBtn = page.locator('button').filter({ hasText: /Ver.*tablero/ })
  await expect(verBtn.first()).toBeVisible({ timeout: 10_000 })
})

// ─── TEST 2: "Ver en tablero" click opens board ──────────────────────────────
test('"Ver en tablero" click opens board overlay', async ({ page }) => {
  await waitForApp(page)
  await setupBoardWithPieces(page)
  await confirmBoardAndResources(page)

  const verBtn = page.locator('button').filter({ hasText: /Ver.*en tablero|Ver.*recomendado/ })
  await expect(verBtn.first()).toBeVisible({ timeout: 5_000 })
  await verBtn.first().click()

  // Board overlay opens — SVG visible
  await expect(page.locator('svg').first()).toBeVisible({ timeout: 5000 })
  await page.waitForTimeout(1000)
})

// ─── TEST 3: Game start → dice → auto question ──────────────────────────────
test('game start: dice → auto question with recommendation', async ({ page }) => {
  await waitForApp(page)
  await setupBoardWithPieces(page)
  await confirmBoardAndResources(page)

  // "Iniciar partida" button
  const startBtn = page.locator('button').filter({ hasText: /Iniciar partida/ })
  await expect(startBtn).toBeVisible({ timeout: 15_000 })
  await startBtn.click()
  await page.waitForTimeout(1000)

  // Dice input: select number 6
  const diceBtn = page.locator('button').filter({ hasText: /^6$/ }).first()
  // If dice buttons are visible as a grid, find the one with just "6"
  const allBtns = page.locator('button')
  const count = await allBtns.count()
  let diceClicked = false
  for (let i = 0; i < count && !diceClicked; i++) {
    const text = await allBtns.nth(i).innerText().catch(() => '')
    if (text.trim().startsWith('6') && text.length < 10) {
      await allBtns.nth(i).click()
      diceClicked = true
    }
  }

  // Confirm dice
  await page.waitForTimeout(500)
  const confirmDice = page.locator('button').filter({ hasText: /Confirmar/ })
  if (await confirmDice.first().isVisible()) {
    await confirmDice.first().click()
  }

  // Wait for LLM response after dice
  await waitForLLMResponse(page)

  // At least one "Ver en tablero" button should be visible
  const verBtns = page.locator('button').filter({ hasText: /Ver.*en tablero|Ver.*recomendado/ })
  const verCount = await verBtns.count()
  expect(verCount).toBeGreaterThanOrEqual(1)
})

// ─── TEST 4: Aprende mode (no board) still works ────────────────────────────
test('aprende mode works without board', async ({ page }) => {
  await waitForApp(page)
  await page.getByText('Solo dudas').click()

  const textarea = page.locator('[data-tour="chat-input"]')
  await expect(textarea).toBeEnabled()

  await textarea.fill('¿Cuánto cuesta construir un poblado?')
  await textarea.press('Enter')

  // Wait for response — use longer timeout for LLM
  await waitForLLMResponse(page)

  // Verify the page has any assistant response content
  // Look for any non-user message bubble
  const content = await page.content()
  // The response should mention resources (madera, arcilla, lana, trigo)
  expect(content.toLowerCase()).toMatch(/madera|arcilla|lana|trigo|ladrillo/)
})

// ─── TEST 5: No RECOMMENDATION_JSON in visible text ─────────────────────────
test('no RECOMMENDATION_JSON marker visible in chat', async ({ page }) => {
  await waitForApp(page)
  await setupBoardWithPieces(page)
  await confirmBoardAndResources(page)

  // Check the entire page text doesn't contain the marker
  const pageText = await page.innerText('body')
  expect(pageText).not.toContain('RECOMMENDATION_JSON')
})
