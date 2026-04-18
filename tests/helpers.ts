/**
 * Shared Playwright helpers for Catan Coach E2E tests.
 *
 * Concentra funciones que antes se copiaban entre `master-audit.spec.ts`,
 * `e2e-full-flow.spec.ts` y otros specs. Fuente única de verdad para:
 *  - init de la app / onboarding
 *  - setup de colores (2 / 3 / 4 jugadores)
 *  - colocación de piezas (settlement / road)
 *  - espera de streaming del LLM
 */

import { expect, Page } from '@playwright/test'

export const BASE = 'http://localhost:3000'

/** Abre la app, salta el onboarding y espera a que el header esté visible. */
export async function initApp(page: Page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.clear()
    localStorage.setItem('catan-onboarding-done', '1')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('header', { timeout: 10_000 })
  await page.waitForTimeout(500)
}

/** Variante sin `localStorage.clear()` — mantiene onboarding done pero no resetea. */
export async function waitForApp(page: Page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.setItem('catan-onboarding-done', '1'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('header', { timeout: 10_000 })
  await page.waitForTimeout(500)
}

/** Asigna el primer color disponible a Tú y selecciona "somos 2". */
export async function setupColors2Players(page: Page) {
  const colorCircles = page.locator('[data-tour="color-picker"] button.rounded-full')
  await expect(colorCircles.first()).toBeVisible({ timeout: 5000 })
  await colorCircles.first().click()
  await page.waitForTimeout(300)
  await page.getByText('No hay J3 ni J4 (somos 2)').click()
  await page.waitForTimeout(500)
}

/**
 * Click en el botón "Pueblo" (si está visible y habilitado) y después dispatch
 * de un click sobre el grupo SVG del vértice. El dispatch evita que los círculos
 * de hint (pointer-events) bloqueen el tap en algunos browsers.
 */
export async function placeSettlement(page: Page, vertexId: number) {
  const puebloBtn = page.locator('button').filter({ hasText: /Pueblo/ })
  if ((await puebloBtn.count()) > 0 && (await puebloBtn.first().isVisible())) {
    const disabled = await puebloBtn.first().isDisabled().catch(() => false)
    if (!disabled) {
      await puebloBtn.first().click()
      await page.waitForTimeout(200)
    }
  }
  await page.evaluate((id) => {
    const g = document.querySelector(`g[data-vertex-id="${id}"]`)
    if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }, vertexId)
  await page.waitForTimeout(300)
}

/** Equivalente a `placeSettlement` pero para aristas/caminos. */
export async function placeRoad(page: Page, edgeId: string) {
  const caminoBtn = page.locator('button').filter({ hasText: /Camino/ })
  if ((await caminoBtn.count()) > 0 && (await caminoBtn.first().isVisible())) {
    const disabled = await caminoBtn.first().isDisabled().catch(() => false)
    if (!disabled) {
      await caminoBtn.first().click()
      await page.waitForTimeout(200)
    }
  }
  await page.evaluate((id) => {
    const g = document.querySelector(`g[data-edge-id="${id}"]`)
    if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }, edgeId)
  await page.waitForTimeout(300)
}

/**
 * Espera a que termine el streaming del LLM:
 *  1. Fase 1: aparecen los puntos de typing (o ya terminó muy rápido).
 *  2. Fase 2: los puntos desaparecen → respuesta completa.
 */
export async function waitForLLM(page: Page, timeoutMs = 150_000) {
  try {
    await page.locator('span.animate-bounce').first().waitFor({ state: 'visible', timeout: 15_000 })
  } catch {
    // Respuesta muy rápida o puntos ya desaparecidos: aceptable.
    await page.waitForTimeout(2000)
  }
  await page.locator('span.animate-bounce').first().waitFor({ state: 'hidden', timeout: timeoutMs })
  await page.waitForTimeout(2000)
}

/** Alias retrocompatible con el viejo nombre en e2e-full-flow.spec.ts. */
export const waitForLLMResponse = waitForLLM
export const setupColorsSimple = setupColors2Players
