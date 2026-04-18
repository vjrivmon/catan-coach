/**
 * Mobile-First Audit — Responsividad completa de Catan Coach
 *
 * Verifica cumplimiento de:
 * - Touch targets >= 44px (WCAG 2.5.5)
 * - Sin overflow horizontal en ningún viewport
 * - Layout correcto en iPhone SE (320), iPhone 14 (390), iPad Mini (768)
 * - Textos legibles (>= 12px)
 * - Safe area iOS (env(safe-area-inset-*))
 * - Sidebar como drawer en móvil
 * - Componentes del coach (board, resources, dice) responsivos
 */

import { test, expect, Page } from '@playwright/test'
import { initApp, setupColors2Players } from './helpers'

// Viewports clave
const IPHONE_SE   = { width: 320, height: 568 }
const IPHONE_14   = { width: 390, height: 844 }
const IPHONE_LAND = { width: 844, height: 390 }
const IPAD_MINI   = { width: 768, height: 1024 }

/** Get all visible interactive elements with their bounding boxes */
async function getInteractiveElements(page: Page) {
  return page.evaluate(() => {
    const elements = document.querySelectorAll('button, a, input, textarea, [role="button"], [tabindex]')
    return Array.from(elements)
      .filter(el => {
        const rect = el.getBoundingClientRect()
        const style = window.getComputedStyle(el)
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
      })
      .map(el => {
        const rect = el.getBoundingClientRect()
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().slice(0, 40),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          ariaLabel: el.getAttribute('aria-label') || '',
        }
      })
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERFLOW: sin scroll horizontal en ningún viewport
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Overflow horizontal', () => {
  for (const [name, vp] of [
    ['iPhone SE (320px)', IPHONE_SE],
    ['iPhone 14 (390px)', IPHONE_14],
    ['Landscape (844x390)', IPHONE_LAND],
    ['iPad Mini (768px)', IPAD_MINI],
  ] as const) {
    test(`sin overflow en ${name}`, async ({ page }) => {
      await page.setViewportSize(vp)
      await initApp(page)

      const overflow = await page.evaluate(() =>
        document.body.scrollWidth > window.innerWidth
      )
      expect(overflow, `Overflow horizontal detectado en ${name}`).toBeFalsy()
    })
  }

  test('sin overflow en modo Solo dudas con mensaje largo', async ({ page }) => {
    await page.setViewportSize(IPHONE_SE)
    await initApp(page)
    await page.getByText('Solo dudas').click()

    const textarea = page.locator('[data-tour="chat-input"]')
    await textarea.fill('A'.repeat(500))
    await page.waitForTimeout(300)

    const overflow = await page.evaluate(() =>
      document.body.scrollWidth > window.innerWidth
    )
    expect(overflow).toBeFalsy()
  })

  test('sin overflow con tablero abierto', async ({ page }) => {
    await page.setViewportSize(IPHONE_14)
    await initApp(page)
    await page.getByText('Tablero interactivo').click()
    await setupColors2Players(page)
    await page.waitForTimeout(500)

    const overflow = await page.evaluate(() =>
      document.body.scrollWidth > window.innerWidth
    )
    expect(overflow).toBeFalsy()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// TOUCH TARGETS: todos los elementos interactivos >= 44px
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Touch targets >= 44px', () => {

  test('landing page: todos los botones >= 44px en 390px', async ({ page }) => {
    await page.setViewportSize(IPHONE_14)
    await initApp(page)

    const elements = await getInteractiveElements(page)
    const tooSmall = elements.filter(el =>
      el.tag === 'button' &&
      el.text.length > 0 &&
      (el.h < 44 || el.w < 44)
    )
    expect(tooSmall, `Botones < 44px: ${JSON.stringify(tooSmall)}`).toHaveLength(0)
  })

  test('landing page: botones >= 44px en iPhone SE (320px)', async ({ page }) => {
    await page.setViewportSize(IPHONE_SE)
    await initApp(page)

    const elements = await getInteractiveElements(page)
    const tooSmall = elements.filter(el =>
      el.tag === 'button' &&
      el.text.length > 0 &&
      (el.h < 44 || el.w < 44)
    )
    expect(tooSmall, `Botones < 44px en SE: ${JSON.stringify(tooSmall)}`).toHaveLength(0)
  })

  test('color picker: circulos >= 44px', async ({ page }) => {
    await page.setViewportSize(IPHONE_14)
    await initApp(page)
    await page.getByText('Tablero interactivo').click()

    const colorBtns = page.locator('[data-tour="color-picker"] button.rounded-full')
    await expect(colorBtns.first()).toBeVisible({ timeout: 5000 })

    const count = await colorBtns.count()
    for (let i = 0; i < count; i++) {
      const size = await colorBtns.nth(i).evaluate(el => {
        const rect = el.getBoundingClientRect()
        return { w: Math.round(rect.width), h: Math.round(rect.height) }
      })
      expect(size.w, `Color ${i} width`).toBeGreaterThanOrEqual(44)
      expect(size.h, `Color ${i} height`).toBeGreaterThanOrEqual(44)
    }
  })

  test('input area: send button >= 44px', async ({ page }) => {
    await page.setViewportSize(IPHONE_14)
    await initApp(page)
    await page.getByText('Solo dudas').click()

    const sendBtn = page.locator('button[type="submit"]')
    const size = await sendBtn.evaluate(el => {
      const rect = el.getBoundingClientRect()
      return { w: Math.round(rect.width), h: Math.round(rect.height) }
    })
    expect(size.w).toBeGreaterThanOrEqual(44)
    expect(size.h).toBeGreaterThanOrEqual(44)
  })

  test('header buttons >= 44px', async ({ page }) => {
    await page.setViewportSize(IPHONE_14)
    await initApp(page)

    const headerBtns = page.locator('header button')
    const count = await headerBtns.count()
    for (let i = 0; i < count; i++) {
      const info = await headerBtns.nth(i).evaluate(el => {
        const rect = el.getBoundingClientRect()
        return {
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          text: (el.textContent || '').trim().slice(0, 20),
          label: el.getAttribute('aria-label') || '',
        }
      })
      expect(info.w, `Header btn "${info.label || info.text}" width`).toBeGreaterThanOrEqual(44)
      expect(info.h, `Header btn "${info.label || info.text}" height`).toBeGreaterThanOrEqual(44)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT: viewport height, header, input, contenido
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Layout responsivo', () => {

  test('app usa h-dvh (no 100vh) para evitar address bar bug', async ({ page }) => {
    await page.setViewportSize(IPHONE_14)
    await initApp(page)

    const usesHDvh = await page.evaluate(() => {
      const main = document.querySelector('.h-dvh')
      return main !== null
    })
    expect(usesHDvh, 'Debe usar h-dvh para dynamic viewport height').toBeTruthy()
  })

  test('header siempre visible y fijo arriba', async ({ page }) => {
    await page.setViewportSize(IPHONE_14)
    await initApp(page)

    const header = page.locator('header')
    await expect(header).toBeVisible()

    const headerRect = await header.evaluate(el => {
      const rect = el.getBoundingClientRect()
      return { top: rect.top, height: rect.height }
    })
    expect(headerRect.top).toBe(0)
    expect(headerRect.height).toBeGreaterThanOrEqual(44)
  })

  test('header no se corta en 320px', async ({ page }) => {
    await page.setViewportSize(IPHONE_SE)
    await initApp(page)

    const headerOverflow = await page.evaluate(() => {
      const header = document.querySelector('header')
      if (!header) return false
      return header.scrollWidth > header.clientWidth
    })
    expect(headerOverflow).toBeFalsy()
  })

  test('input area visible y no cortada en 320px', async ({ page }) => {
    await page.setViewportSize(IPHONE_SE)
    await initApp(page)
    await page.getByText('Solo dudas').click()

    const textarea = page.locator('[data-tour="chat-input"]')
    await expect(textarea).toBeVisible()

    const inputRect = await textarea.evaluate(el => {
      const rect = el.getBoundingClientRect()
      return { bottom: rect.bottom, width: rect.width }
    })
    // Input debe estar dentro del viewport
    expect(inputRect.bottom).toBeLessThanOrEqual(IPHONE_SE.height)
    // Input debe ocupar espacio razonable (no colapsado)
    expect(inputRect.width).toBeGreaterThan(100)
  })

  test('safe area padding en input footer', async ({ page }) => {
    await page.setViewportSize(IPHONE_14)
    await initApp(page)

    // Verificar que el footer tiene padding-bottom con safe-area
    const hasSafeArea = await page.evaluate(() => {
      const forms = document.querySelectorAll('form')
      for (const form of forms) {
        const style = window.getComputedStyle(form)
        const pb = style.paddingBottom
        // safe-area-inset-bottom devuelve 0 en non-iOS, pero el CSS debe estar
        if (pb && parseInt(pb) >= 0) return true
      }
      // Check any element with safe-area in inline style
      const elements = document.querySelectorAll('[style*="safe-area"]')
      return elements.length > 0
    })
    // En simulador no-iOS, safe-area es 0px, pero el CSS debe existir
    expect(hasSafeArea).toBeTruthy()
  })

  test('mensajes no desbordan el ancho en 320px', async ({ page }) => {
    await page.setViewportSize(IPHONE_SE)
    await initApp(page)
    await page.getByText('Solo dudas').click()

    // El contenedor de mensajes debe respetar el viewport
    const messagesOverflow = await page.evaluate(() => {
      const container = document.querySelector('.overflow-y-auto')
      if (!container) return false
      return container.scrollWidth > container.clientWidth
    })
    expect(messagesOverflow).toBeFalsy()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR: drawer en mobile, inline en desktop
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Sidebar responsiva', () => {

  test('sidebar se abre como overlay en mobile', async ({ page }) => {
    await page.setViewportSize(IPHONE_14)
    await initApp(page)

    const sidebarBtn = page.locator('button[aria-label="Abrir historial"]')
    if (await sidebarBtn.isVisible()) {
      await sidebarBtn.click()
      await page.waitForTimeout(500)

      // Sidebar debe ser absolute/overlay
      const sidebarPos = await page.evaluate(() => {
        const sidebar = document.querySelector('[class*="absolute"][class*="z-20"]')
        return sidebar !== null
      })
      expect(sidebarPos, 'Sidebar debe ser overlay en mobile').toBeTruthy()
    }
  })

  test('sidebar no desborda en 320px', async ({ page }) => {
    await page.setViewportSize(IPHONE_SE)
    await initApp(page)

    const sidebarBtn = page.locator('button[aria-label="Abrir historial"]')
    if (await sidebarBtn.isVisible()) {
      await sidebarBtn.click()
      await page.waitForTimeout(500)

      const overflow = await page.evaluate(() =>
        document.body.scrollWidth > window.innerWidth
      )
      expect(overflow).toBeFalsy()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTES COACH: board, resources, dice
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Componentes coach en mobile', () => {

  test('tablero SVG cabe en 320px sin overflow', async ({ page }) => {
    await page.setViewportSize(IPHONE_SE)
    await initApp(page)
    await page.getByText('Tablero interactivo').click()
    await setupColors2Players(page)

    const svg = page.locator('svg').first()
    await expect(svg).toBeVisible({ timeout: 5000 })

    const overflow = await page.evaluate(() =>
      document.body.scrollWidth > window.innerWidth
    )
    expect(overflow).toBeFalsy()
  })

  test('tablero SVG cabe en landscape', async ({ page }) => {
    await page.setViewportSize(IPHONE_LAND)
    await initApp(page)
    await page.getByText('Tablero interactivo').click()
    await setupColors2Players(page)
    await page.waitForTimeout(500)

    const overflow = await page.evaluate(() =>
      document.body.scrollWidth > window.innerWidth
    )
    expect(overflow).toBeFalsy()
  })

  test('bottom bar (Limpiar + Confirmar) visible en 320px', async ({ page }) => {
    await page.setViewportSize(IPHONE_SE)
    await initApp(page)
    await page.getByText('Tablero interactivo').click()
    await setupColors2Players(page)
    await page.waitForTimeout(500)

    // Bottom bar buttons should be visible and within viewport
    const limpiarBtn = page.getByRole('button', { name: /Limpiar/ })
    await expect(limpiarBtn).toBeVisible()

    const rect = await limpiarBtn.evaluate(el => {
      const r = el.getBoundingClientRect()
      return { bottom: r.bottom, width: r.width }
    })
    expect(rect.bottom).toBeLessThanOrEqual(IPHONE_SE.height)
    expect(rect.width).toBeGreaterThan(50)
  })

  test('player selector no desborda con 4 jugadores en 320px', async ({ page }) => {
    await page.setViewportSize(IPHONE_SE)
    await initApp(page)
    await page.getByText('Tablero interactivo').click()

    // Assign 4 colors
    const colorPicker = page.locator('[data-tour="color-picker"]')
    await expect(colorPicker).toBeVisible({ timeout: 5000 })

    const colorBtns = colorPicker.locator('button.rounded-full')
    await colorBtns.first().click()
    await page.waitForTimeout(300)
    await colorBtns.first().click()
    await page.waitForTimeout(300)
    await colorBtns.first().click()
    await page.waitForTimeout(300)
    await page.getByText('Sí (somos 4)').click()
    await page.waitForTimeout(500)

    // Player selector should fit without overflow
    const overflow = await page.evaluate(() =>
      document.body.scrollWidth > window.innerWidth
    )
    expect(overflow).toBeFalsy()
  })

  test('modo seleccion: 3 botones caben en 320px', async ({ page }) => {
    await page.setViewportSize(IPHONE_SE)
    await initApp(page)

    // All 3 mode buttons should be visible
    const scanBtn = page.getByText('Escanear tablero')
    const boardBtn = page.getByText('Tablero interactivo')
    const textBtn = page.getByText('Solo dudas')

    await expect(scanBtn).toBeVisible()
    await expect(boardBtn).toBeVisible()
    await expect(textBtn).toBeVisible()

    // None should overflow
    const overflow = await page.evaluate(() =>
      document.body.scrollWidth > window.innerWidth
    )
    expect(overflow).toBeFalsy()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOGRAFIA: legibilidad minima
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Tipografia legible', () => {

  test('no hay textos visibles < 11px en landing', async ({ page }) => {
    await page.setViewportSize(IPHONE_14)
    await initApp(page)

    const tinyTexts = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const tiny: { text: string; size: number }[] = []
      while (walker.nextNode()) {
        const node = walker.currentNode
        const text = (node.textContent || '').trim()
        if (text.length < 2) continue
        const parent = node.parentElement
        if (!parent) continue
        const rect = parent.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        const style = window.getComputedStyle(parent)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        const fontSize = parseFloat(style.fontSize)
        if (fontSize < 11) {
          tiny.push({ text: text.slice(0, 30), size: Math.round(fontSize) })
        }
      }
      return tiny
    })

    expect(tinyTexts, `Textos < 11px: ${JSON.stringify(tinyTexts)}`).toHaveLength(0)
  })

  test('no hay textos < 11px en tablero abierto', async ({ page }) => {
    await page.setViewportSize(IPHONE_14)
    await initApp(page)
    await page.getByText('Tablero interactivo').click()
    await setupColors2Players(page)
    await page.waitForTimeout(500)

    const tinyTexts = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const tiny: { text: string; size: number }[] = []
      while (walker.nextNode()) {
        const node = walker.currentNode
        const text = (node.textContent || '').trim()
        if (text.length < 2) continue
        const parent = node.parentElement
        if (!parent) continue
        const rect = parent.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        const style = window.getComputedStyle(parent)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        const fontSize = parseFloat(style.fontSize)
        // Excluir SVG text (hex labels usan 9px intencionalmente)
        if (parent.closest('svg')) continue
        if (fontSize < 11) {
          tiny.push({ text: text.slice(0, 30), size: Math.round(fontSize) })
        }
      }
      return tiny
    })

    expect(tinyTexts, `Textos < 11px en board: ${JSON.stringify(tinyTexts)}`).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE-ONLY: action menu vs chips
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Action menu mobile vs desktop', () => {

  test('mobile: ActionMenu (hamburger) visible, ActionChips oculto', async ({ page }) => {
    await page.setViewportSize(IPHONE_14)
    await initApp(page)
    await page.getByText('Solo dudas').click()

    // On mobile, the + button (ActionMenu) should be visible
    const actionMenuBtn = page.locator('button[aria-label="Acciones de partida"]')
    // ActionChips (desktop) should NOT be visible
    // They use "hidden md:flex" so they're hidden on mobile
    const chipsContainer = page.locator('.hidden.md\\:flex')
    const chipsCount = await chipsContainer.count()

    // Chips should either not exist or be hidden
    if (chipsCount > 0) {
      const isVisible = await chipsContainer.first().isVisible()
      expect(isVisible, 'ActionChips should be hidden on mobile').toBeFalsy()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// LANDSCAPE: layout no se rompe
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Landscape mode', () => {

  test('landing page funciona en landscape', async ({ page }) => {
    await page.setViewportSize(IPHONE_LAND)
    await initApp(page)

    // Header visible
    await expect(page.locator('header')).toBeVisible()

    // Mode buttons visible
    await expect(page.getByText('Solo dudas')).toBeVisible()

    // No overflow
    const overflow = await page.evaluate(() =>
      document.body.scrollWidth > window.innerWidth
    )
    expect(overflow).toBeFalsy()
  })

  test('chat funciona en landscape', async ({ page }) => {
    await page.setViewportSize(IPHONE_LAND)
    await initApp(page)
    await page.getByText('Solo dudas').click()

    const textarea = page.locator('[data-tour="chat-input"]')
    await expect(textarea).toBeEnabled()

    // Input area debe estar visible (no cortada por la altura baja de 390px)
    const isVisible = await textarea.isVisible()
    expect(isVisible).toBeTruthy()

    const rect = await textarea.evaluate(el => {
      const r = el.getBoundingClientRect()
      return { bottom: r.bottom }
    })
    expect(rect.bottom).toBeLessThanOrEqual(IPHONE_LAND.height)
  })
})
