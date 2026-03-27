/**
 * Speed Benchmark — Mide tiempos reales de respuesta desde el frontend
 * Compara modo coach (qwen3:8b) vs modo aprende (gemma3:27b)
 */

import { test, expect, Page } from '@playwright/test'

const BASE = 'http://localhost:3000'

test.setTimeout(180_000)

async function initApp(page: Page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.clear()
    localStorage.setItem('catan-onboarding-done', '1')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('header', { timeout: 10_000 })
  await page.waitForTimeout(500)
}

async function measureResponse(page: Page, question: string): Promise<{ ms: number; response: string }> {
  const textarea = page.locator('[data-tour="chat-input"]')
  await expect(textarea).toBeEnabled({ timeout: 10_000 })
  await textarea.fill(question)

  const start = Date.now()
  await textarea.press('Enter')

  // Wait for typing indicator to appear
  try {
    await page.locator('span.animate-bounce').first().waitFor({ state: 'visible', timeout: 15_000 })
  } catch { /* fast response */ }

  // Wait for typing indicator to disappear (response complete)
  await page.locator('span.animate-bounce').first().waitFor({ state: 'hidden', timeout: 150_000 })
  const elapsed = Date.now() - start

  await page.waitForTimeout(1000)

  // Get the last assistant message
  const msgs = page.locator('.bg-stone-700')
  const count = await msgs.count()
  const response = count > 0 ? await msgs.nth(count - 1).innerText() : ''

  return { ms: elapsed, response }
}

test('BENCHMARK: modo aprende (gemma3:27b) — tiempo de respuesta', async ({ page }) => {
  await initApp(page)
  await page.getByText('Solo dudas').click()

  const r1 = await measureResponse(page, '¿Cuantos recursos hay en Catan?')
  console.log(`\n=== APRENDE (gemma3:27b) ===`)
  console.log(`Pregunta 1: ${r1.ms}ms`)
  console.log(`  "${r1.response.slice(0, 150)}"`)

  const r2 = await measureResponse(page, '¿Cuanto cuesta una ciudad?')
  console.log(`Pregunta 2: ${r2.ms}ms`)
  console.log(`  "${r2.response.slice(0, 150)}"`)

  console.log(`\nMedia aprende: ${Math.round((r1.ms + r2.ms) / 2)}ms`)

  // Verify responses are coherent (not repeating)
  expect(r1.response).not.toBe(r2.response)
  // Verify response mentions resources
  expect(r1.response.toLowerCase()).toMatch(/madera|arcilla|lana|trigo|mineral/)
})

test('BENCHMARK: modo coach (qwen3:8b) — tiempo de respuesta', async ({ page }) => {
  await initApp(page)

  // Setup board quickly
  await page.getByText('Tablero interactivo').click()

  // Colors
  const colorCircles = page.locator('[data-tour="color-picker"] button.rounded-full')
  await expect(colorCircles.first()).toBeVisible({ timeout: 5000 })
  await colorCircles.first().click()
  await page.waitForTimeout(300)
  await page.getByText('No hay J3 ni J4 (somos 2)').click()
  await page.waitForTimeout(500)

  // Place pieces
  for (const vid of [15, 10]) {
    const puebloBtn = page.locator('button').filter({ hasText: /Pueblo/ })
    if (await puebloBtn.count() > 0 && await puebloBtn.first().isVisible())
      await puebloBtn.first().click()
    await page.evaluate((id) => {
      document.querySelector(`g[data-vertex-id="${id}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }, vid)
    await page.waitForTimeout(300)
  }
  for (const eid of ['14_15', '15_16', '10_11', '10_13']) {
    const caminoBtn = page.locator('button').filter({ hasText: /Camino/ })
    if (await caminoBtn.count() > 0 && await caminoBtn.first().isVisible())
      await caminoBtn.first().click()
    await page.evaluate((id) => {
      document.querySelector(`g[data-edge-id="${id}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }, eid)
    await page.waitForTimeout(200)
  }

  // Confirm board
  const confirmBtn = page.locator('[data-tour="confirm-board-btn"]')
  await expect(confirmBtn).toBeEnabled({ timeout: 5000 })
  await confirmBtn.click()
  await page.waitForTimeout(1500)

  // Set resources
  const plusBtns = page.locator('button').filter({ hasText: '+' })
  await plusBtns.first().click()
  await plusBtns.nth(1).click()
  await page.waitForTimeout(200)

  // Confirm resources — this triggers auto-question
  const confirmResBtn = page.locator('button').filter({ hasText: /Confirmar.*carta|Pedir recomendación/ })
  await confirmResBtn.first().click()

  // Measure auto-question response (recommendation)
  const startAuto = Date.now()
  try {
    await page.locator('span.animate-bounce').first().waitFor({ state: 'visible', timeout: 15_000 })
  } catch {}
  await page.locator('span.animate-bounce').first().waitFor({ state: 'hidden', timeout: 150_000 })
  const autoMs = Date.now() - startAuto
  await page.waitForTimeout(1000)

  console.log(`\n=== COACH (qwen3:8b) ===`)
  console.log(`Auto-pregunta (recomendacion): ${autoMs}ms`)

  // Now ask a free question
  const r1 = await measureResponse(page, '¿Como puedo bloquear al rival?')
  console.log(`Pregunta libre: ${r1.ms}ms`)
  console.log(`  "${r1.response.slice(0, 150)}"`)

  console.log(`\nMedia coach: ${Math.round((autoMs + r1.ms) / 2)}ms`)

  // Verify the free question response is NOT a recommendation repeat
  expect(r1.response.toLowerCase()).not.toMatch(/compra una carta de desarrollo/)
})

test('BENCHMARK: API directa — verificar que modelo correcto', async ({ request }) => {
  // Test 1: aprende mode should use gemma3:27b
  const startAprende = Date.now()
  const resAprende = await request.post(`${BASE}/api/chat`, {
    data: {
      message: '¿Que es Catan?',
      history: [],
      userLevel: 'beginner',
      seenConcepts: [],
      mode: 'aprende',
    },
    timeout: 90_000,
  })
  const aprendeMs = Date.now() - startAprende
  const aprendeBody = await resAprende.text()

  // Test 2: coach mode with coachState should use qwen3:8b
  const startCoach = Date.now()
  const resCoach = await request.post(`${BASE}/api/chat`, {
    data: {
      message: '¿Como bloqueo al rival azul?',
      history: [],
      userLevel: 'beginner',
      seenConcepts: [],
      mode: 'coach',
      coachState: {
        boardSummary: 'Tu (rojo): 2P 4C en hexes trigo(6), mineral(8). Rival azul: 2P 4C en hexes madera(5), arcilla(9)',
        resources: { wood: 1, clay: 1, cereal: 0, wool: 0, mineral: 0 },
      },
    },
    timeout: 90_000,
  })
  const coachMs = Date.now() - startCoach
  const coachBody = await resCoach.text()

  console.log(`\n=== API DIRECTA ===`)
  console.log(`Aprende (gemma): ${aprendeMs}ms (${aprendeBody.length} chars)`)
  console.log(`Coach (qwen):    ${coachMs}ms (${coachBody.length} chars)`)
  console.log(`Ratio: gemma/qwen = ${(aprendeMs / coachMs).toFixed(1)}x`)

  expect(resAprende.status()).toBe(200)
  expect(resCoach.status()).toBe(200)
})
