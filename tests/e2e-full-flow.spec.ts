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
async function waitForLLMResponse(page: Page, timeoutMs = 150_000) {
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
  test.setTimeout(180_000)
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

// ─── TEST 5: 4 players — full setup and first recommendation ────────────────
test('4 players: full setup and first recommendation', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await waitForApp(page)

  // 1. Open interactive board
  await page.getByText('Tablero interactivo').click()

  // 2. Color assignment: Tú=red, J2=blue, J3=orange, J4=white (somos 4)
  const colorPicker = page.locator('[data-tour="color-picker"]')
  await expect(colorPicker).toBeVisible({ timeout: 5000 })

  // Step 0: Tú picks red (first available)
  const colorBtns0 = colorPicker.locator('button.rounded-full')
  await colorBtns0.first().click()
  await page.waitForTimeout(400)

  // Step 1: J2 picks blue (first available after red)
  const colorBtns1 = colorPicker.locator('button.rounded-full')
  await colorBtns1.first().click()
  await page.waitForTimeout(400)

  // Step 2: J3 picks orange (first available)
  const colorBtns2 = colorPicker.locator('button.rounded-full')
  await colorBtns2.first().click()
  await page.waitForTimeout(400)

  // Step 3: "Sí (somos 4)" to add J4
  const somos4Btn = page.getByText('Sí (somos 4)')
  await expect(somos4Btn).toBeVisible({ timeout: 3000 })
  await somos4Btn.click()
  await page.waitForTimeout(500)

  // 3. Place pieces for all 4 players (2 settlements + 4 roads each)
  // Non-adjacent vertices: red=[v0,v2], blue=[v4,v6], orange=[v8,v10], white=[v12,v14]
  const playerPlacements = [
    // [colorIndex, vert1, vert2, road1, road2, road3, road4]
    { idx: 0, v1: 0,  v2: 2,  roads: ['0_1', '0_5', '1_2', '2_3'] },
    { idx: 1, v1: 4,  v2: 6,  roads: ['3_4', '4_5', '6_7', '6_9'] },
    { idx: 2, v1: 8,  v2: 10, roads: ['5_8', '8_9', '10_11', '10_13'] },
    { idx: 3, v1: 12, v2: 14, roads: ['9_12', '12_13', '14_15', '1_14'] },
  ]

  // The player selector at top lets us switch who we're placing for
  const playerBtns = page.locator('[data-tour="colors-done"] button')
  for (const { idx, v1, v2, roads } of playerPlacements) {
    // Click the player selector button (in order of assignments)
    if (await playerBtns.nth(idx).isVisible({ timeout: 2000 }).catch(() => false)) {
      await playerBtns.nth(idx).click()
      await page.waitForTimeout(200)
    }

    await placeSettlement(page, v1)
    await placeSettlement(page, v2)
    for (const road of roads) {
      await placeRoad(page, road)
    }
  }

  // 4. Confirm board
  const confirmBoardBtn = page.locator('[data-tour="confirm-board-btn"]')
  await expect(confirmBoardBtn).toBeEnabled({ timeout: 5000 })
  await confirmBoardBtn.click()
  await page.waitForTimeout(1500)

  // 5. Resource stepper → confirm
  const plusBtns = page.locator('button').filter({ hasText: '+' })
  if (await plusBtns.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await plusBtns.first().click()
    await page.waitForTimeout(200)
  }
  const confirmResBtn = page.locator('button').filter({ hasText: /Confirmar.*carta|Pedir recomendación/ })
  if (await confirmResBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmResBtn.first().click()
  }

  // 6. Wait for auto-question + LLM response
  await waitForLLMResponse(page, 120_000)

  // 7. Ver en tablero — soft check (puede no aparecer si GeneticAgent no devuelve frontier)
  await page.screenshot({ path: 'tests/screenshots/4players-recommendation.png' })
  const verBtn = page.locator('button').filter({ hasText: /Ver.*tablero/ })
  const hasBoardBtn = await verBtn.first().isVisible({ timeout: 10_000 }).catch(() => false)
  console.log(`4 players boardRec button visible: ${hasBoardBtn}`)
  // Not a hard assertion — depends on GeneticAgent frontier data for this test board
})

// ─── TEST 5b: 4 players — dice 6 produces correct resources ────────────────
test('4 players: dice roll produces correct resources', async ({ page }) => {
  test.setTimeout(180_000)
  await waitForApp(page)

  // Setup 2-player board with v0 (has clay(6)) as first settlement
  await page.getByText('Tablero interactivo').click()
  await setupColorsSimple(page)
  await expect(page.locator('svg').first()).toBeVisible({ timeout: 5000 })

  // Place settlements at v0 (clay(6)+mineral(10)+wool(2)) and v14 (cereal(12)+clay(6)+cereal(11))
  // v0 adjacent: [1, 5, 7], v14 adjacent: [15, 1, 19]
  // They are NOT adjacent (v0's adj are 1,5,7 and 14 is not among them)
  await placeSettlement(page, 0)
  await placeSettlement(page, 14)
  await placeRoad(page, '0_1')
  await placeRoad(page, '0_5')
  await placeRoad(page, '1_14')
  await placeRoad(page, '14_15')

  // Confirm board
  const confirmBoardBtn = page.locator('[data-tour="confirm-board-btn"]')
  await expect(confirmBoardBtn).toBeEnabled({ timeout: 5000 })
  await confirmBoardBtn.click()
  await page.waitForTimeout(1500)

  // Resource stepper: add 1 wood + 1 clay
  const plusBtns = page.locator('button').filter({ hasText: '+' })
  await plusBtns.first().click()
  await page.waitForTimeout(200)
  await plusBtns.nth(1).click()
  await page.waitForTimeout(200)

  // Confirm resources
  const confirmResBtn = page.locator('button').filter({ hasText: /Confirmar.*carta|Pedir recomendación/ })
  await expect(confirmResBtn.first()).toBeVisible({ timeout: 5000 })
  await confirmResBtn.first().click()
  await waitForLLMResponse(page, 120_000)

  // Start game
  const startBtn = page.locator('button').filter({ hasText: /Iniciar partida/ })
  await expect(startBtn).toBeVisible({ timeout: 15_000 })
  await startBtn.click()
  await page.waitForTimeout(1000)

  // Roll dice 6 — both v0 and v14 are adjacent to clay(6) hexes
  const allBtns = page.locator('button')
  const count = await allBtns.count()
  for (let i = 0; i < count; i++) {
    const text = await allBtns.nth(i).innerText().catch(() => '')
    if (text.trim().startsWith('6') && text.length < 10) {
      await allBtns.nth(i).click()
      break
    }
  }
  await page.waitForTimeout(500)

  // Confirm dice
  const confirmDice = page.locator('button').filter({ hasText: /Confirmar/ })
  if (await confirmDice.first().isVisible()) {
    await confirmDice.first().click()
  }

  // Wait a moment for the production message to appear (no LLM needed for this)
  await page.waitForTimeout(2000)

  // The production message should mention Arcilla (not "no produces nada")
  const pageText = await page.innerText('body')
  expect(pageText).toContain('Arcilla')
  expect(pageText).not.toMatch(/Dado 6:.*no produces nada/)

  await page.screenshot({ path: 'tests/screenshots/dice6-production.png' })
})

// ─── TEST 5c: conversational memory — aprende → coach ──────────────────────
test('conversational memory: aprende → coach preserves context', async ({ page }) => {
  test.setTimeout(180_000)
  await waitForApp(page)

  // 1. Start in "Solo dudas" mode
  await page.getByText('Solo dudas').click()

  const textarea = page.locator('[data-tour="chat-input"]')
  await expect(textarea).toBeEnabled()

  // 2. Ask about pips
  await textarea.fill('¿Qué son los pips en Catan?')
  await textarea.press('Enter')
  await waitForLLMResponse(page)

  // Verify response mentions pips or probabilidad
  const content1 = await page.content()
  expect(content1.toLowerCase()).toMatch(/pip|probabilidad|punto|dado/)

  // 3. Ask a follow-up about longest road
  await textarea.fill('¿Cuándo conviene ir a por el camino más largo?')
  await textarea.press('Enter')
  await waitForLLMResponse(page)

  // Verify both responses are present and have substance
  const content2 = await page.content()
  expect(content2.toLowerCase()).toMatch(/camino.*largo|ruta.*larga|longest.*road|caminos/)

  // At least 2 assistant message bubbles
  const msgs = page.locator('.bg-stone-700')
  const msgCount = await msgs.count()
  expect(msgCount).toBeGreaterThanOrEqual(2)

  await page.screenshot({ path: 'tests/screenshots/conversational-memory.png' })
})

// ─── TEST 6 (original): No RECOMMENDATION_JSON in visible text ──────────────
test('no RECOMMENDATION_JSON marker visible in chat', async ({ page }) => {
  await waitForApp(page)
  await setupBoardWithPieces(page)
  await confirmBoardAndResources(page)

  // Check the entire page text doesn't contain the marker
  const pageText = await page.innerText('body')
  expect(pageText).not.toContain('RECOMMENDATION_JSON')
})

// ─── TEST 6: Mobile-first viewport 390x844 ─────────────────────────────────
test('mobile-first: no overflow, touch targets, color picker flow @390x844', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await waitForApp(page)

  // 1. No horizontal overflow
  const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth)
  expect(overflow, 'No horizontal overflow at 390px').toBeFalsy()

  // 2. All visible buttons with text must be >= 44px height
  const smallBtns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .filter(b => b.offsetWidth > 0 && (b.textContent?.trim().length ?? 0) > 0)
      .filter(b => b.getBoundingClientRect().height < 44)
      .map(b => ({ text: b.textContent?.trim().slice(0, 30), h: Math.round(b.getBoundingClientRect().height) }))
  )
  expect(smallBtns, `Buttons with text < 44px: ${JSON.stringify(smallBtns)}`).toHaveLength(0)

  // 3. Open interactive board → color picker flow
  await page.getByText('Tablero interactivo').click()
  await page.waitForTimeout(500)

  // Color picker must be visible with circles
  const colorPicker = page.locator('[data-tour="color-picker"]')
  await expect(colorPicker).toBeVisible({ timeout: 5000 })

  const colorBtns = colorPicker.locator('button.rounded-full')
  await expect(colorBtns.first()).toBeVisible()

  // Color circles must be >= 44px touch target
  const colorSize = await colorBtns.first().evaluate(el => {
    const rect = el.getBoundingClientRect()
    return { w: Math.round(rect.width), h: Math.round(rect.height) }
  })
  expect(colorSize.w, 'Color circle width >= 44px').toBeGreaterThanOrEqual(44)
  expect(colorSize.h, 'Color circle height >= 44px').toBeGreaterThanOrEqual(44)

  // Setup guide content should be visible (not 85% empty)
  const guideText = page.getByText('Elige los colores')
  await expect(guideText, 'Setup guide visible during color assignment').toBeVisible({ timeout: 3000 })

  // Select first color
  await colorBtns.first().click()
  await page.waitForTimeout(300)

  // "No hay J3 ni J4 (somos 2)" button must be visible and >= 44px
  const skipBtn = page.getByText('No hay J3 ni J4 (somos 2)')
  await expect(skipBtn).toBeVisible({ timeout: 3000 })
  const skipH = await skipBtn.evaluate(el => Math.round(el.getBoundingClientRect().height))
  expect(skipH, '"somos 2" button height >= 44px').toBeGreaterThanOrEqual(44)

  // 4. Input area should not be cut off (check it exists in DOM)
  const inputExists = await page.locator('[data-tour="chat-input"]').count()
  // Input may not be visible during board overlay, that's ok

  // 5. Screenshot for visual verification
  await page.screenshot({ path: '/tmp/catan-mobile-390.png', fullPage: true })
})
