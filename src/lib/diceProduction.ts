/**
 * diceProduction.ts
 * Calcula automáticamente qué recursos produce un número de dado
 * dado el estado del tablero (piezas + geometría).
 */

import { TERRAIN_ORDER, NUMBERS, VERT_TO_HEXES, RESOURCE_NAMES } from './boardGeometry'

export type ResourceKey = 'clay' | 'mineral' | 'wood' | 'cereal' | 'wool'
export type ResourceCounts = Record<ResourceKey, number>

export interface DiceProductionResult {
  produced:   ResourceCounts
  newTotals:  ResourceCounts
  summary:    string
  hexDetails: string[]
}

const EMPTY_RESOURCES = (): ResourceCounts =>
  ({ clay: 0, mineral: 0, wood: 0, cereal: 0, wool: 0 })

/**
 * Calcula los recursos producidos por un número de dado para el jugador.
 * @param diceValue  Número sacado (2-12). Si es 7, devuelve vacío.
 * @param pieces     Estado del tablero (clave: "v{id}" o "e{lo}_{hi}")
 * @param myColor    Color del jugador activo
 * @param robberHex  Índice del hex donde está el ladrón (9 = desierto = inactivo)
 * @param current    Recursos actuales en mano (para calcular newTotals)
 */
export function computeResourcesFromDice(
  diceValue: number,
  pieces:    Record<string, { type: 'settlement' | 'city' | 'road'; color: string }>,
  myColor:   string,
  robberHex: number,
  current:   ResourceCounts | null = null,
): DiceProductionResult {
  const produced    = EMPTY_RESOURCES()
  const hexDetails: string[] = []

  if (diceValue !== 7) {
    for (const [key, piece] of Object.entries(pieces)) {
      if (!key.startsWith('v'))  continue  // solo vértices producen
      if (piece.color !== myColor) continue
      if (piece.type === 'road')   continue

      const vid        = parseInt(key.slice(1))
      const hexIndices = VERT_TO_HEXES.get(vid) ?? []
      const multiplier = piece.type === 'city' ? 2 : 1

      for (const hi of hexIndices) {
        if (NUMBERS[hi]       !== diceValue)  continue
        if (TERRAIN_ORDER[hi] === 'desert')   continue
        if (hi                === robberHex)  continue

        const terrain = TERRAIN_ORDER[hi] as ResourceKey
        produced[terrain] = (produced[terrain] ?? 0) + multiplier

        const pieceName = piece.type === 'city' ? 'Ciudad' : 'Poblado'
        const resName   = RESOURCE_NAMES[terrain] ?? terrain
        hexDetails.push(`${terrain}(${diceValue}): ${pieceName} → +${multiplier} ${resName}`)
      }
    }
  }

  // Sumar a los recursos actuales
  const base      = current ?? EMPTY_RESOURCES()
  const newTotals = EMPTY_RESOURCES()
  for (const k of Object.keys(base) as ResourceKey[]) {
    newTotals[k] = (base[k] ?? 0) + (produced[k] ?? 0)
  }

  // Summary para el chat
  let summary: string
  if (diceValue === 7) {
    summary = 'Ha salido un 7 — el ladrón se activa.'
  } else {
    const gainParts = Object.entries(produced)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${RESOURCE_NAMES[k] ?? k}×${v}`)

    summary = gainParts.length > 0
      ? `Dado ${diceValue}: recibes ${gainParts.join(', ')}`
      : `Dado ${diceValue}: no produces nada este turno`
  }

  return { produced, newTotals, summary, hexDetails }
}
