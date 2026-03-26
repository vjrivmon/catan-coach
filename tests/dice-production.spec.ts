/**
 * Unit tests for computeResourcesFromDice — runs in Node (no browser needed).
 *
 * Verifies that the dice production logic correctly maps dice values
 * to resources based on board geometry.
 */
import { test, expect } from '@playwright/test'
import { computeResourcesFromDice, type ResourceCounts } from '../src/lib/diceProduction'
import { VERT_TO_HEXES, NUMBERS, TERRAIN_ORDER } from '../src/lib/boardGeometry'

// ─── Helpers ────────────────────────────────────────────────────────────────
/** Find vertex IDs adjacent to a specific hex index */
function verticesForHex(hexIdx: number): number[] {
  const verts: number[] = []
  for (const [vid, hexes] of VERT_TO_HEXES.entries()) {
    if (hexes.includes(hexIdx)) verts.push(vid)
  }
  return verts
}

/** Find a vertex adjacent to ALL given hex indices */
function vertexAdjacentToAll(...hexIndices: number[]): number | null {
  for (const [vid, hexes] of VERT_TO_HEXES.entries()) {
    if (hexIndices.every(h => hexes.includes(h))) return vid
  }
  return null
}

// ─── Geometry sanity checks ─────────────────────────────────────────────────
test('geometry: hex 4 is clay with number 6', () => {
  expect(TERRAIN_ORDER[4]).toBe('clay')
  expect(NUMBERS[4]).toBe(6)
})

test('geometry: hex 17 is wood with number 6', () => {
  expect(TERRAIN_ORDER[17]).toBe('wood')
  expect(NUMBERS[17]).toBe(6)
})

// ─── Bug fix: dice 6 produces clay when player has settlement on clay(6) ────
test('bug fix: dice 6 produces clay when player has settlement adjacent to clay(6)', () => {
  const verts = verticesForHex(4) // hex 4 = clay, number 6
  expect(verts.length).toBeGreaterThan(0)

  const vid = verts[0]
  const pieces = { [`v${vid}`]: { type: 'settlement' as const, color: 'red' } }
  const result = computeResourcesFromDice(6, pieces, 'red', 9, null)

  expect(result.produced.clay).toBe(1)
  expect(result.summary).toContain('Arcilla')
  expect(result.summary).not.toContain('no produces nada')
})

test('bug fix: dice 6 produces wood when player has settlement adjacent to wood(6)', () => {
  const verts = verticesForHex(17) // hex 17 = wood, number 6
  expect(verts.length).toBeGreaterThan(0)

  const vid = verts[0]
  const pieces = { [`v${vid}`]: { type: 'settlement' as const, color: 'red' } }
  const result = computeResourcesFromDice(6, pieces, 'red', 9, null)

  expect(result.produced.wood).toBe(1)
  expect(result.summary).toContain('Madera')
  expect(result.summary).not.toContain('no produces nada')
})

test('bug fix: dice 6 produces clay+wood when vertex touches both clay(6) and wood(6)', () => {
  // Find vertex adjacent to BOTH hex 4 (clay,6) and hex 17 (wood,6)
  const vid = vertexAdjacentToAll(4, 17)
  if (vid === null) {
    // These hexes aren't adjacent on the standard board — test with two separate settlements
    const clayVid = verticesForHex(4)[0]
    const woodVid = verticesForHex(17)[0]
    const pieces = {
      [`v${clayVid}`]: { type: 'settlement' as const, color: 'red' },
      [`v${woodVid}`]: { type: 'settlement' as const, color: 'red' },
    }
    const result = computeResourcesFromDice(6, pieces, 'red', 9, null)
    expect(result.produced.clay).toBe(1)
    expect(result.produced.wood).toBe(1)
    expect(result.summary).toContain('Arcilla')
    expect(result.summary).toContain('Madera')
    expect(result.summary).not.toContain('no produces nada')
  } else {
    const pieces = { [`v${vid}`]: { type: 'settlement' as const, color: 'red' } }
    const result = computeResourcesFromDice(6, pieces, 'red', 9, null)
    expect(result.produced.clay).toBe(1)
    expect(result.produced.wood).toBe(1)
    expect(result.summary).toContain('Arcilla')
    expect(result.summary).toContain('Madera')
    expect(result.summary).not.toContain('no produces nada')
  }
})

// ─── Color matching ─────────────────────────────────────────────────────────
test('only produces for matching color — other colors ignored', () => {
  const vid = verticesForHex(4)[0]
  const pieces = { [`v${vid}`]: { type: 'settlement' as const, color: 'blue' } }
  const result = computeResourcesFromDice(6, pieces, 'red', 9, null)

  expect(result.produced.clay).toBe(0)
  expect(result.summary).toContain('no produces nada')
})

// ─── City produces double ───────────────────────────────────────────────────
test('city produces double resources', () => {
  const vid = verticesForHex(4)[0]
  const pieces = { [`v${vid}`]: { type: 'city' as const, color: 'red' } }
  const result = computeResourcesFromDice(6, pieces, 'red', 9, null)

  expect(result.produced.clay).toBe(2)
  expect(result.summary).toContain('Arcilla×2')
})

// ─── Robber blocks production ───────────────────────────────────────────────
test('robber on hex blocks production', () => {
  const vid = verticesForHex(4)[0]
  const pieces = { [`v${vid}`]: { type: 'settlement' as const, color: 'red' } }
  // Robber on hex 4 = clay(6)
  const result = computeResourcesFromDice(6, pieces, 'red', 4, null)

  expect(result.produced.clay).toBe(0)
  expect(result.summary).toContain('no produces nada')
})

// ─── Dice 7 ─────────────────────────────────────────────────────────────────
test('dice 7 produces nothing — robber message', () => {
  const vid = verticesForHex(4)[0]
  const pieces = { [`v${vid}`]: { type: 'settlement' as const, color: 'red' } }
  const result = computeResourcesFromDice(7, pieces, 'red', 9, null)

  expect(Object.values(result.produced).every(v => v === 0)).toBe(true)
  expect(result.summary).toContain('7')
  expect(result.summary).toContain('ladrón')
})

// ─── newTotals accumulates correctly ────────────────────────────────────────
test('newTotals adds produced to current resources', () => {
  const vid = verticesForHex(4)[0]
  const pieces = { [`v${vid}`]: { type: 'settlement' as const, color: 'red' } }
  const current: ResourceCounts = { clay: 2, mineral: 0, wood: 1, cereal: 0, wool: 3 }
  const result = computeResourcesFromDice(6, pieces, 'red', 9, current)

  expect(result.newTotals.clay).toBe(3)   // 2 + 1
  expect(result.newTotals.wood).toBe(1)   // unchanged
  expect(result.newTotals.wool).toBe(3)   // unchanged
})

// ─── Empty pieces → no production ───────────────────────────────────────────
test('empty pieces returns no production', () => {
  const result = computeResourcesFromDice(6, {}, 'red', 9, null)
  expect(result.summary).toContain('no produces nada')
})

// ─── Roads don't produce ────────────────────────────────────────────────────
test('roads do not produce resources', () => {
  const vid = verticesForHex(4)[0]
  const pieces = { [`v${vid}`]: { type: 'road' as const, color: 'red' } }
  const result = computeResourcesFromDice(6, pieces, 'red', 9, null)

  expect(result.produced.clay).toBe(0)
  expect(result.summary).toContain('no produces nada')
})
