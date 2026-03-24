/**
 * diceProduction.ts
 * Calcula automáticamente qué recursos produce un número de dado
 * dado el estado del tablero (piezas + geometría).
 *
 * No requiere intervención del usuario — usa las posiciones ya guardadas.
 */

// ── Geometría del tablero estándar (mirrors BoardOverlay.tsx) ─────────────────
const R      = 40
const W      = Math.sqrt(3) * R
const ROW_H  = 1.5 * R
const ROWS   = [
  { n: 3, colStart: 1 }, { n: 4, colStart: 0.5 }, { n: 5, colStart: 0 },
  { n: 4, colStart: 0.5 }, { n: 3, colStart: 1 },
]
const SVG_W   = 390
const PAD_TOP = 50
const X0      = (SVG_W - 5 * W) / 2 + W / 2
const ANGLES  = [30, 90, 150, 210, 270, 330].map(d => (d * Math.PI) / 180)

// Tablero estándar principiantes (mirrors TERRAIN_ORDER + NUMBERS en BoardOverlay)
export const TERRAIN_ORDER = [
  'mineral','wool','wood',
  'cereal','clay','wool','clay',
  'clay','cereal','desert','wood','mineral',
  'wood','mineral','cereal','wool',
  'cereal','wood','wool',
] as const

export const NUMBERS = [10,2,9, 12,6,4,10, 9,11,0,3,8, 8,3,4,5, 5,6,11]

// ── Build vertex → hex indices map (computed once at module load) ─────────────
function buildVertToHexes(): Map<number, number[]> {
  const vertMap      = new Map<string, number>()
  const vertToHexes  = new Map<number, number[]>()
  let vId = 0, hi = 0

  for (let row = 0; row < ROWS.length; row++) {
    for (let col = 0; col < ROWS[row].n; col++) {
      const cx = X0 + (ROWS[row].colStart + col) * W
      const cy = PAD_TOP + row * ROW_H
      for (const a of ANGLES) {
        const vx = cx + R * Math.cos(a)
        const vy = cy + R * Math.sin(a)
        const k  = `${Math.round(vx)},${Math.round(vy)}`
        if (!vertMap.has(k)) { vertMap.set(k, vId++) }
        const vid = vertMap.get(k)!
        if (!vertToHexes.has(vid)) vertToHexes.set(vid, [])
        const arr = vertToHexes.get(vid)!
        if (!arr.includes(hi)) arr.push(hi)
      }
      hi++
    }
  }
  return vertToHexes
}

const VERT_TO_HEXES = buildVertToHexes()

// ── Types ─────────────────────────────────────────────────────────────────────
export type ResourceKey = 'clay' | 'mineral' | 'wood' | 'cereal' | 'wool'
export type ResourceCounts = Record<ResourceKey, number>

export interface DiceProductionResult {
  produced:    ResourceCounts          // recursos ganados este turno
  newTotals:   ResourceCounts          // recursos en mano tras sumar
  summary:     string                  // texto para el chat
  hexDetails:  string[]                // ["mineral(8): +1 Mineral", ...]
}

const RESOURCE_NAMES: Record<string, string> = {
  clay: 'Arcilla', mineral: 'Mineral', wood: 'Madera', cereal: 'Trigo', wool: 'Lana',
}
const EMPTY_RESOURCES = (): ResourceCounts =>
  ({ clay: 0, mineral: 0, wood: 0, cereal: 0, wool: 0 })

// ── Main function ─────────────────────────────────────────────────────────────
/**
 * Calcula los recursos producidos por un número de dado para el jugador.
 * @param diceValue  Número sacado (2-12). Si es 7, devuelve vacío.
 * @param pieces     Estado actual del tablero (clave: "v{id}" o "e{lo}_{hi}")
 * @param myColor    Color del jugador activo
 * @param robberHex  Índice del hex donde está el ladrón (9 = desierto = inactivo)
 * @param current    Recursos actuales en mano (para calcular new totals)
 */
export function computeResourcesFromDice(
  diceValue:  number,
  pieces:     Record<string, { type: 'settlement' | 'city' | 'road'; color: string }>,
  myColor:    string,
  robberHex:  number,
  current:    ResourceCounts | null = null,
): DiceProductionResult {
  const produced   = EMPTY_RESOURCES()
  const hexDetails: string[] = []

  if (diceValue !== 7) {
    for (const [key, piece] of Object.entries(pieces)) {
      // Solo vértices con piezas del jugador activo
      if (!key.startsWith('v')) continue
      if (piece.color !== myColor) continue
      if (piece.type === 'road') continue

      const vid        = parseInt(key.slice(1))
      const hexIndices = VERT_TO_HEXES.get(vid) ?? []
      const multiplier = piece.type === 'city' ? 2 : 1

      for (const hi of hexIndices) {
        if (NUMBERS[hi]       !== diceValue)   continue  // número distinto
        if (TERRAIN_ORDER[hi] === 'desert')    continue  // desierto
        if (hi                === robberHex)   continue  // ladrón bloquea

        const terrain = TERRAIN_ORDER[hi] as ResourceKey
        produced[terrain] = (produced[terrain] ?? 0) + multiplier

        const pieceName = piece.type === 'city' ? 'Ciudad' : 'Poblado'
        const resName   = RESOURCE_NAMES[terrain] ?? terrain
        hexDetails.push(
          `${terrain}(${diceValue}): ${pieceName} → +${multiplier} ${resName}`
        )
      }
    }
  }

  // Sumar a los recursos actuales
  const base      = current ?? EMPTY_RESOURCES()
  const newTotals = EMPTY_RESOURCES()
  for (const k of Object.keys(produced) as ResourceKey[]) {
    newTotals[k] = (base[k] ?? 0) + produced[k]
  }
  // Copiar los que no cambiaron
  for (const k of Object.keys(base) as ResourceKey[]) {
    if (newTotals[k] === 0) newTotals[k] = base[k] ?? 0
  }

  // Construir summary para el chat
  let summary: string
  if (diceValue === 7) {
    summary = 'Ha salido un 7 — el ladrón se activa.'
  } else {
    const gainParts = Object.entries(produced)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${RESOURCE_NAMES[k] ?? k}×${v}`)

    summary = gainParts.length > 0
      ? `Dado ${diceValue}: recibes ${gainParts.join(', ')}`
      : `Dado ${diceValue}: no produces nada este turno (ninguna pieza en hexes con ese número)`
  }

  return { produced, newTotals, summary, hexDetails }
}
