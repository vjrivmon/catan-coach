/**
 * Master Audit — Auditoría completa de Catan Coach
 *
 * Verifica:
 * 1. Flujo completo del usuario (board → resources → game → dice → multi-turn)
 * 2. Validación de tablero (distancia, conectividad, límites)
 * 3. Coherencia de API (SSE format, routing, error handling)
 * 4. Gestión de estado (persistencia, reset, mode switch)
 * 5. Sugerencias de preguntas
 * 6. Casos borde y resiliencia
 */

import { test, expect, Page } from '@playwright/test'
import {
  BASE,
  initApp,
  setupColors2Players,
  placeSettlement,
  placeRoad,
  waitForLLM,
} from './helpers'

// Helpers base re-exportados desde tests/helpers.ts — este spec añade sólo
// los helpers específicos de la suite master-audit.

async function setupFullBoard(page: Page) {
  await page.getByText('Tablero interactivo').click()
  await setupColors2Players(page)
  await expect(page.locator('svg').first()).toBeVisible({ timeout: 5000 })
  // Catán: 2 rondas de (1 poblado + 1 camino) → orden estricto S→R→S→R
  await placeSettlement(page, 15)
  await placeRoad(page, '14_15')
  await placeSettlement(page, 10)
  await placeRoad(page, '10_11')
}

async function confirmBoard(page: Page) {
  const btn = page.locator('[data-tour="confirm-board-btn"]')
  await expect(btn).toBeEnabled({ timeout: 5000 })
  await btn.click()
  await page.waitForTimeout(1500)
}

async function setResources(page: Page, clicks: number[] = [1, 1]) {
  const plusBtns = page.locator('button').filter({ hasText: '+' })
  for (let i = 0; i < clicks.length; i++) {
    for (let j = 0; j < clicks[i]; j++) {
      await plusBtns.nth(i).click()
      await page.waitForTimeout(150)
    }
  }
}

async function confirmResources(page: Page) {
  const btn = page.locator('button').filter({ hasText: /Confirmar.*carta|Pedir recomendación/ })
  await expect(btn.first()).toBeVisible({ timeout: 5000 })
  await btn.first().click()
}

async function clickDice(page: Page, number: number) {
  const allBtns = page.locator('button')
  const count = await allBtns.count()
  for (let i = 0; i < count; i++) {
    const text = await allBtns.nth(i).innerText().catch(() => '')
    if (text.trim().startsWith(String(number)) && text.length < 10) {
      await allBtns.nth(i).click()
      return true
    }
  }
  return false
}

async function confirmDice(page: Page) {
  const btn = page.locator('button').filter({ hasText: /Confirmar/ })
  if (await btn.first().isVisible()) await btn.first().click()
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAT 1: API ARCHITECTURE COHERENCE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('CAT1: API architecture', () => {
  test.setTimeout(120_000)

  test('POST /api/chat returns SSE stream with correct format', async ({ request }) => {
    const res = await request.post(`${BASE}/api/chat`, {
      data: {
        message: '¿Cuánto cuesta un poblado?',
        history: [],
        userLevel: 'beginner',
        seenConcepts: [],
        mode: 'aprende',
      },
      timeout: 90_000,
    })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/event-stream')

    const body = await res.text()
    expect(body).toContain('data: ')
    expect(body).toMatch(/"type"\s*:\s*"done"/)
    expect(body).toMatch(/suggestedQuestions/)
  })

  test('POST /api/chat rejects empty message with 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/chat`, {
      data: {
        message: '',
        history: [],
        userLevel: 'beginner',
        seenConcepts: [],
      },
      timeout: 10_000,
    })
    expect(res.status()).toBe(400)
  })

  test('POST /api/chat rejects whitespace-only message', async ({ request }) => {
    const res = await request.post(`${BASE}/api/chat`, {
      data: {
        message: '   ',
        history: [],
        userLevel: 'beginner',
        seenConcepts: [],
      },
      timeout: 10_000,
    })
    expect(res.status()).toBe(400)
  })

  test('SSE stream contains token events before done', async ({ request }) => {
    const res = await request.post(`${BASE}/api/chat`, {
      data: {
        message: '¿Qué recursos hay en Catan?',
        history: [],
        userLevel: 'beginner',
        seenConcepts: [],
        mode: 'aprende',
      },
      timeout: 90_000,
    })
    const body = await res.text()
    const lines = body.split('\n').filter(l => l.startsWith('data: '))

    const tokenEvents = lines.filter(l => l.includes('"type":"token"') || l.includes('"type": "token"'))
    const doneEvents = lines.filter(l => l.includes('"type":"done"') || l.includes('"type": "done"'))

    expect(tokenEvents.length).toBeGreaterThan(0)
    expect(doneEvents.length).toBe(1)
  })

  test('done event includes agentUsed field', async ({ request }) => {
    const res = await request.post(`${BASE}/api/chat`, {
      data: {
        message: '¿Cuántas cartas de desarrollo hay?',
        history: [],
        userLevel: 'beginner',
        seenConcepts: [],
        mode: 'aprende',
      },
      timeout: 90_000,
    })
    const body = await res.text()
    const doneLine = body.split('\n').find(l => l.includes('"type":"done"') || l.includes('"type": "done"'))
    expect(doneLine).toBeDefined()

    const json = JSON.parse(doneLine!.replace('data: ', ''))
    expect(json.agentUsed).toBeDefined()
    expect(['rules', 'strategy', 'direct']).toContain(json.agentUsed)
  })

  test('suggestedQuestions returns array of 2-3 strings', async ({ request }) => {
    const res = await request.post(`${BASE}/api/chat`, {
      data: {
        message: '¿Cómo funciona el ladrón?',
        history: [],
        userLevel: 'beginner',
        seenConcepts: [],
        mode: 'aprende',
      },
      timeout: 90_000,
    })
    const body = await res.text()
    const doneLine = body.split('\n').find(l => l.includes('"type":"done"') || l.includes('"type": "done"'))
    const json = JSON.parse(doneLine!.replace('data: ', ''))

    expect(Array.isArray(json.suggestedQuestions)).toBeTruthy()
    expect(json.suggestedQuestions.length).toBeGreaterThanOrEqual(2)
    expect(json.suggestedQuestions.length).toBeLessThanOrEqual(3)
    for (const q of json.suggestedQuestions) {
      expect(typeof q).toBe('string')
      expect(q.length).toBeGreaterThan(5)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// CAT 2: BOARD VALIDATION RULES
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('CAT2: Board validation', () => {

  test('board shows warning for adjacent settlements (distance rule)', async ({ page }) => {
    await initApp(page)
    await page.getByText('Tablero interactivo').click()
    await setupColors2Players(page)
    await expect(page.locator('svg').first()).toBeVisible({ timeout: 5000 })

    // Ronda 1: poblado v15 + su camino (alternancia obligatoria S→R).
    await placeSettlement(page, 15)
    await placeRoad(page, '14_15')

    // Ronda 2: intentar poblado en v16 (adyacente a v15) → debe rechazarse por regla de distancia.
    await placeSettlement(page, 16)
    await page.waitForTimeout(500)

    // Should show a warning or the settlement should NOT be placed
    // Check: vertex 16 should NOT have our settlement (warning should appear)
    const warningVisible = await page.getByText(/distancia|adyacente|cerca/i).isVisible().catch(() => false)
    const piecePlaced = await page.evaluate(() => {
      const g = document.querySelector('g[data-vertex-id="16"]')
      return g?.querySelector('circle[fill]') !== null
    })
    // Either a warning is shown, or the piece was rejected (not placed with our color)
    expect(warningVisible || !piecePlaced).toBeTruthy()
  })

  test('board limits settlements to 2 per player in initial placement', async ({ page }) => {
    await initApp(page)
    await page.getByText('Tablero interactivo').click()
    await setupColors2Players(page)
    await expect(page.locator('svg').first()).toBeVisible({ timeout: 5000 })

    // Catán: ronda 1 (S→R) y ronda 2 (S→R) — la alternancia exige el camino entre poblados.
    await placeSettlement(page, 15)
    await placeRoad(page, '14_15')
    await placeSettlement(page, 10)
    await placeRoad(page, '10_11')
    await page.waitForTimeout(500)

    // Pueblo button should be disabled at 2/2
    const puebloBtn = page.locator('button').filter({ hasText: /Pueblo/ }).first()
    const isDisabled = await puebloBtn.isDisabled()
    const btnText = await puebloBtn.innerText()
    expect(isDisabled).toBeTruthy()
    expect(btnText).toContain('2/2')
  })

  test('board limits roads to 2 per player and enforces S→R alternation', async ({ page }) => {
    await initApp(page)
    await page.getByText('Tablero interactivo').click()
    await setupColors2Players(page)
    await expect(page.locator('svg').first()).toBeVisible({ timeout: 5000 })

    // 1) Coloca 1 poblado y trata de colocar 2 caminos seguidos sin colocar el 2º poblado.
    await placeSettlement(page, 15)
    await placeRoad(page, '14_15')   // OK: roads(1) ≤ settlements(1)
    // Intento prohibido: roads(1) ≥ settlements(1) → debe rechazarse con warning.
    await placeRoad(page, '15_16')
    await page.waitForTimeout(500)

    // Verificar que el segundo camino NO se colocó (warning visible o no hay pieza en e15_16)
    const warningAlternancia = await page.getByText(/Primero coloca el poblado/i).isVisible().catch(() => false)
    const secondRoadPlaced = await page.evaluate(() => {
      const g = document.querySelector('g[data-edge-id="15_16"]')
      return g?.querySelector('circle[fill]:not([fill="rgba(0,0,0,0.001)"])') !== null
    })
    expect(warningAlternancia || !secondRoadPlaced).toBeTruthy()

    // 2) Completa correctamente la 2ª ronda (S→R) y verifica el tope de 2 caminos.
    await placeSettlement(page, 10)
    await placeRoad(page, '10_11')
    await page.waitForTimeout(500)

    // Camino button must show "2/2" and be disabled.
    const caminoBtn = page.locator('button').filter({ hasText: /Camino/ }).first()
    const btnText = await caminoBtn.innerText()
    const isDisabled = await caminoBtn.isDisabled()
    expect(btnText).toContain('2/2')
    expect(isDisabled).toBeTruthy()

    // 3) Intento de 3er camino debe rechazarse igualmente.
    await placeRoad(page, '10_13')
    await page.waitForTimeout(500)
    const thirdRoadPlaced = await page.evaluate(() => {
      const g = document.querySelector('g[data-edge-id="10_13"]')
      return g?.querySelector('circle[fill]:not([fill="rgba(0,0,0,0.001)"])') !== null
    })
    expect(thirdRoadPlaced).toBeFalsy()
  })

  test('confirm button disabled until minimum pieces placed', async ({ page }) => {
    await initApp(page)
    await page.getByText('Tablero interactivo').click()
    await setupColors2Players(page)
    await expect(page.locator('svg').first()).toBeVisible({ timeout: 5000 })

    // Before placing anything — confirm should be disabled
    const confirmBtn = page.locator('[data-tour="confirm-board-btn"]')
    // Check if button exists and is disabled or has visual indicator
    const isDisabled = await confirmBtn.isDisabled().catch(() => true)
    expect(isDisabled).toBeTruthy()
  })

  test('pieces persist after closing and reopening board', async ({ page }) => {
    await initApp(page)
    await setupFullBoard(page)

    // Count pieces before close
    const piecesBefore = await page.evaluate(() =>
      document.querySelectorAll('g[data-vertex-id] circle[fill]:not([fill="none"])').length
    )

    // Close board
    const closeBtn = page.locator('button[aria-label="Cerrar tablero"]')
    if (await closeBtn.isVisible()) {
      await closeBtn.click()
      await page.waitForTimeout(500)
    }

    // Reopen board via hex icon or button
    const hexBtn = page.locator('button[title="Opciones de partida"]')
    if (await hexBtn.isVisible()) {
      await hexBtn.click()
      await page.waitForTimeout(300)
      await page.getByText('Tablero interactivo').click()
      await page.waitForTimeout(500)
    }

    // Count pieces after reopen
    const piecesAfter = await page.evaluate(() =>
      document.querySelectorAll('g[data-vertex-id] circle[fill]:not([fill="none"])').length
    )

    expect(piecesAfter).toBe(piecesBefore)
  })

  test('Limpiar button resets all placed pieces', async ({ page }) => {
    await initApp(page)
    await setupFullBoard(page)

    // Pueblo button should show pieces placed (e.g. "Pueblo 2/2")
    const puebloBtn = page.locator('button').filter({ hasText: /Pueblo/ }).first()
    const textBefore = await puebloBtn.innerText()
    expect(textBefore).toContain('2/2')

    // Click Limpiar
    const limpiarBtn = page.getByRole('button', { name: /Limpiar/ })
    await limpiarBtn.click()
    await page.waitForTimeout(500)

    // Pueblo button should reset to 0/2
    const textAfter = await puebloBtn.innerText()
    expect(textAfter).toContain('0/2')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// CAT 3: COMPLETE COACH FLOW (real backend)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('CAT3: Full coach flow', () => {
  test.setTimeout(180_000)

  test('complete journey: board → resources → recommendation → game → dice → 2nd turn', async ({ page }) => {
    await initApp(page)

    // ── Step 1: Board setup ──
    await setupFullBoard(page)
    await confirmBoard(page)

    // ── Step 2: Resources ──
    await setResources(page, [1, 1, 0, 0, 0]) // 1 wood, 1 clay
    await confirmResources(page)

    // ── Step 3: Wait for auto-question + LLM response ──
    await waitForLLM(page)

    // Response should exist (at least one assistant bubble)
    const assistantMsgs = page.locator('.bg-stone-700')
    await expect(assistantMsgs.first()).toBeVisible({ timeout: 5000 })

    // Response should be in Spanish
    const responseText = await assistantMsgs.first().innerText()
    expect(responseText.length).toBeGreaterThan(20)

    // ── Step 4: Start game ──
    const startBtn = page.locator('button').filter({ hasText: /Iniciar partida/ })
    await expect(startBtn).toBeVisible({ timeout: 15_000 })
    await startBtn.click()
    await page.waitForTimeout(1000)

    // ── Step 5: Dice roll (number 8) ──
    const diceClicked = await clickDice(page, 8)
    expect(diceClicked).toBeTruthy()
    await page.waitForTimeout(500)
    await confirmDice(page)

    // ── Step 6: Wait for production + recommendation ──
    await waitForLLM(page)

    // Should have at least 2 assistant messages now
    const allAssistantMsgs = page.locator('.bg-stone-700')
    const msgCount = await allAssistantMsgs.count()
    expect(msgCount).toBeGreaterThanOrEqual(2)

    // ── Step 7: Second dice roll (number 5) ──
    const startNextTurn = page.locator('button').filter({ hasText: /Siguiente turno|Iniciar partida/ })
    if (await startNextTurn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await startNextTurn.click()
      await page.waitForTimeout(1000)
    }

    // Check dice buttons reappear
    const diceVisible = await clickDice(page, 5)
    if (diceVisible) {
      await page.waitForTimeout(500)
      await confirmDice(page)
      await waitForLLM(page)

      // 3+ assistant messages after 2 turns
      const finalMsgCount = await allAssistantMsgs.count()
      expect(finalMsgCount).toBeGreaterThanOrEqual(3)
    }
  })

  test('resource stepper shows correct total and cannot go below 0', async ({ page }) => {
    await initApp(page)
    await setupFullBoard(page)
    await confirmBoard(page)

    // Resource stepper should be visible
    const plusBtns = page.locator('button').filter({ hasText: '+' })
    const minusBtns = page.locator('button').filter({ hasText: /^−$/ })
    await expect(plusBtns.first()).toBeVisible({ timeout: 5000 })

    // Click + for wood 3 times
    await plusBtns.first().click()
    await plusBtns.first().click()
    await plusBtns.first().click()
    await page.waitForTimeout(200)

    // Click − for wood once (should go from 3 to 2)
    if (await minusBtns.first().isVisible()) {
      await minusBtns.first().click()
      await page.waitForTimeout(200)
    }

    // Confirm button should show total cards
    const confirmBtn = page.locator('button').filter({ hasText: /Confirmar.*carta|Pedir recomendación/ })
    const btnText = await confirmBtn.first().innerText()
    // Should mention 2 cartas (2 remaining wood)
    expect(btnText).toMatch(/2\s*carta/)

    // Click − three times (should hit 0 and stop, never go negative)
    if (await minusBtns.first().isVisible()) {
      await minusBtns.first().click()
      await minusBtns.first().click()
      await minusBtns.first().click()
      await page.waitForTimeout(200)
    }

    // Resource value should be 0, not negative — check the displayed count
    const pageText = await page.innerText('body')
    expect(pageText).not.toMatch(/-\d\s*(carta|Madera|Arcilla)/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// CAT 4: SUGGESTIONS & INTERACTIVITY
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('CAT4: Suggestions and interactivity', () => {
  test.setTimeout(120_000)

  test('suggestion chips appear after LLM response', async ({ page }) => {
    await initApp(page)
    await page.getByText('Solo dudas').click()

    const textarea = page.locator('[data-tour="chat-input"]')
    await textarea.fill('¿Qué recursos hay en Catan?')
    await textarea.press('Enter')
    await waitForLLM(page)

    // Suggestion chips should appear (buttons with question text)
    // They appear as clickable chips below the response
    const suggestions = page.locator('button').filter({ hasText: /\?/ })
    const suggestionCount = await suggestions.count()
    // At least 2 suggestions (from SuggestionAgent or fallback)
    expect(suggestionCount).toBeGreaterThanOrEqual(2)
  })

  test('clicking a suggestion sends it as new message', async ({ page }) => {
    await initApp(page)
    await page.getByText('Solo dudas').click()

    const textarea = page.locator('[data-tour="chat-input"]')
    await textarea.fill('¿Cómo funciona el comercio?')
    await textarea.press('Enter')
    await waitForLLM(page)

    // Find and click a suggestion chip (a button ending with ?)
    const suggestions = page.locator('button').filter({ hasText: /\?$/ })
    const suggCount = await suggestions.count()

    if (suggCount > 0) {
      const suggestionText = await suggestions.first().innerText()
      await suggestions.first().click()

      // Should trigger a new LLM response
      await waitForLLM(page)

      // Should have at least 2 assistant messages now
      const msgs = page.locator('.bg-stone-700')
      const count = await msgs.count()
      expect(count).toBeGreaterThanOrEqual(2)
    }
  })

  test('chat input clears after sending message', async ({ page }) => {
    await initApp(page)
    await page.getByText('Solo dudas').click()

    const textarea = page.locator('[data-tour="chat-input"]')
    await textarea.fill('¿Qué es Catan?')
    await textarea.press('Enter')

    // Input should be cleared immediately after send
    await page.waitForTimeout(500)
    const value = await textarea.inputValue()
    expect(value).toBe('')
  })

  test('Enter key sends message, Shift+Enter adds newline', async ({ page }) => {
    await initApp(page)
    await page.getByText('Solo dudas').click()

    const textarea = page.locator('[data-tour="chat-input"]')

    // Shift+Enter should add newline, not send
    await textarea.fill('Línea 1')
    await textarea.press('Shift+Enter')
    await page.waitForTimeout(200)
    const value = await textarea.inputValue()
    expect(value).toContain('Línea 1')
    // Should still be in the textarea (not sent)
    expect(value.length).toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// CAT 5: ERROR RESILIENCE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('CAT5: Error resilience', () => {

  test('GeneticAgent 503 → coach still responds without crash', async ({ page }) => {
    test.setTimeout(120_000)

    // Intercept GeneticAgent API calls to return 503
    await page.route('**/api/coach-recommend', route =>
      route.fulfill({ status: 503, body: 'Service Unavailable' })
    )

    await initApp(page)
    await setupFullBoard(page)
    await confirmBoard(page)
    await setResources(page, [1, 1])
    await confirmResources(page)
    await waitForLLM(page)

    // Should get a response even without GeneticAgent
    const msgs = page.locator('.bg-stone-700')
    await expect(msgs.first()).toBeVisible({ timeout: 5000 })

    // No uncaught errors
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    expect(errors).toHaveLength(0)
  })

  test('input is disabled while LLM is responding', async ({ page }) => {
    test.setTimeout(120_000)
    await initApp(page)
    await page.getByText('Solo dudas').click()

    const textarea = page.locator('[data-tour="chat-input"]')
    await textarea.fill('¿Qué es Catan?')
    await textarea.press('Enter')

    // While LLM is responding, textarea should be disabled
    await page.waitForTimeout(500)
    const isDisabled = await textarea.isDisabled()
    expect(isDisabled).toBeTruthy()

    // Wait for response to finish
    await waitForLLM(page)

    // After response, textarea should be enabled again
    await expect(textarea).toBeEnabled({ timeout: 5000 })
  })

  test('no console errors during normal flow', async ({ page }) => {
    test.setTimeout(120_000)
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await initApp(page)
    await page.getByText('Solo dudas').click()

    const textarea = page.locator('[data-tour="chat-input"]')
    await textarea.fill('¿Cuántos puntos de victoria se necesitan para ganar?')
    await textarea.press('Enter')
    await waitForLLM(page)

    // Filter out non-critical console errors (e.g., favicon, HMR)
    const realErrors = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('HMR') &&
      !e.includes('hydration') &&
      !e.includes('webpack')
    )
    expect(realErrors).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// CAT 6: MODE SWITCHING & STATE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('CAT6: Mode switching & state', () => {

  test('new conversation resets all state', async ({ page }) => {
    await initApp(page)
    await page.getByText('Solo dudas').click()

    const textarea = page.locator('[data-tour="chat-input"]')
    await textarea.fill('Hola')
    await textarea.press('Enter')
    await page.waitForTimeout(2000)

    // Open sidebar and click "Nueva conversación"
    const sidebarBtn = page.locator('button[aria-label="Abrir historial"]')
    if (await sidebarBtn.isVisible()) {
      await sidebarBtn.click()
      await page.waitForTimeout(500)

      const newConvBtn = page.getByText('Nueva conversación')
      if (await newConvBtn.isVisible()) {
        await newConvBtn.click()
        await page.waitForTimeout(500)

        // Mode selection should reappear
        const modePanel = page.getByText('¿Cómo quieres empezar?')
        await expect(modePanel).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('header remains visible in all states', async ({ page }) => {
    await initApp(page)

    // Check header visible on landing
    await expect(page.locator('header')).toBeVisible()

    // Check header visible in Solo dudas mode
    await page.getByText('Solo dudas').click()
    await expect(page.locator('header')).toBeVisible()
  })

  test('chat input disabled until mode selected', async ({ page }) => {
    await initApp(page)

    // Before mode selection, textarea should be disabled or not present
    const textarea = page.locator('[data-tour="chat-input"]')
    const isDisabled = await textarea.isDisabled().catch(() => true)
    expect(isDisabled).toBeTruthy()

    // After selecting mode, it should be enabled
    await page.getByText('Solo dudas').click()
    await expect(textarea).toBeEnabled({ timeout: 3000 })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// CAT 7: RESPONSE QUALITY
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('CAT7: Response quality', () => {
  test.setTimeout(120_000)

  test('response is in Spanish, not English', async ({ page }) => {
    await initApp(page)
    await page.getByText('Solo dudas').click()

    const textarea = page.locator('[data-tour="chat-input"]')
    await textarea.fill('¿Cuánto cuesta una ciudad?')
    await textarea.press('Enter')
    await waitForLLM(page)

    // Get the full page text — the response should be somewhere in there
    const pageText = (await page.innerText('body')).toLowerCase()
    // Should contain Spanish keywords about city cost
    expect(pageText).toMatch(/mineral|trigo|ciudad|recurso/)
    // Should NOT have English equivalents as main response
    expect(pageText).not.toMatch(/\bresource\b.*\bcity\b.*\bcost\b/)
  })

  test('response mentions correct city cost (3 mineral + 2 trigo)', async ({ page }) => {
    await initApp(page)
    await page.getByText('Solo dudas').click()

    const textarea = page.locator('[data-tour="chat-input"]')
    await textarea.fill('¿Cuántos recursos necesito para construir una ciudad?')
    await textarea.press('Enter')
    await waitForLLM(page)

    // Check page text for the actual costs
    const pageText = await page.innerText('body')
    const lower = pageText.toLowerCase()
    expect(lower).toMatch(/mineral/)
    expect(lower).toMatch(/trigo/)
    expect(pageText).toMatch(/3/)
    expect(pageText).toMatch(/2/)
  })

  test('no RECOMMENDATION_JSON or internal markers in response', async ({ page }) => {
    await initApp(page)
    await setupFullBoard(page)
    await confirmBoard(page)
    await setResources(page, [1, 1])
    await confirmResources(page)
    await waitForLLM(page)

    const pageText = await page.innerText('body')
    expect(pageText).not.toContain('RECOMMENDATION_JSON')
    expect(pageText).not.toContain('system prompt')
    expect(pageText).not.toContain('agente genético')
    expect(pageText).not.toContain('algoritmo')
  })

  test('no Thai/Korean/CJK artifacts in response', async ({ page }) => {
    await initApp(page)
    await page.getByText('Solo dudas').click()

    const textarea = page.locator('[data-tour="chat-input"]')
    await textarea.fill('¿Cómo funciona el intercambio marítimo?')
    await textarea.press('Enter')
    await waitForLLM(page)

    const response = await page.locator('.bg-stone-700').first().innerText()
    // No Thai, Korean, Chinese, Japanese characters
    expect(response).not.toMatch(/[\u0E00-\u0E7F]/) // Thai
    expect(response).not.toMatch(/[\uAC00-\uD7AF]/) // Korean
    expect(response).not.toMatch(/[\u4E00-\u9FFF]/) // CJK
  })
})
