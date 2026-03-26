/**
 * BoardStateAgent — CÓDIGO PURO, 0 LLM
 *
 * Extrae toda la lógica de cómputo que antes vivía en GeneratorAgent:
 * - Valida recursos contra coachState
 * - Calcula acciones posibles (✓/✗)
 * - Calcula VP actuales
 * - Calcula producción por dado
 * - Calcula estimación de turnos
 *
 * Output: BoardContext (objeto tipado)
 */

import type { CoachState } from './SuggestionAgent'

export interface BoardContext {
  /** Formatted string: ✓/✗ for each buildable action */
  actions: string
  /** Structured actions for programmatic use */
  canBuild: {
    road: boolean
    settlement: boolean
    city: boolean
    devCard: boolean
  }
  /** VP summary string */
  vpSummary: string
  /** VP total number */
  vpTotal: number
  /** Production table string */
  productionTable: string
  /** Turns estimate string (empty if no production data) */
  turnsEstimate: string
  /** Resource line in Spanish */
  resourceLine: string
  /** Turn + dev cards context block */
  turnBlock: string
  devBlock: string
}

const RES_ES: Record<string, string> = {
  wood: 'Madera', clay: 'Arcilla', cereal: 'Trigo/Cereal',
  wool: 'Lana', mineral: 'Mineral',
}

/** Pre-compute what the player can build with their current resources */
export function computeActions(resources: Record<string, number> | null): string {
  if (!resources) return '- Recursos no especificados aún'
  const w = resources.wood    ?? 0
  const c = resources.clay    ?? 0
  const l = resources.wool    ?? 0
  const t = resources.cereal  ?? 0
  const m = resources.mineral ?? 0

  const lines: string[] = []
  lines.push(w >= 1 && c >= 1
    ? '✓ PUEDE construir: Camino (tiene madera y arcilla/ladrillo)'
    : `✗ NO puede Camino (necesita 1 Madera + 1 Arcilla — tiene Madera:${w}, Arcilla:${c})`)
  lines.push(w >= 1 && c >= 1 && l >= 1 && t >= 1
    ? '✓ PUEDE construir: Poblado (tiene madera, arcilla, lana y trigo/cereal)'
    : `✗ NO puede Poblado (necesita 1M+1A+1L+1T — tiene M:${w} A:${c} L:${l} T:${t})`)
  lines.push(m >= 3 && t >= 2
    ? '✓ PUEDE construir: Ciudad (tiene mineral y cereal suficientes)'
    : `✗ NO puede Ciudad (necesita 3 Mineral + 2 Cereal — tiene Mineral:${m}, Cereal:${t})`)
  lines.push(m >= 1 && l >= 1 && t >= 1
    ? '✓ PUEDE comprar: Carta de desarrollo'
    : `✗ NO puede Carta (necesita 1M+1L+1T — tiene M:${m} L:${l} T:${t})`)

  return lines.join('\n')
}

/** Structured check of what the player can build */
export function computeCanBuild(resources: Record<string, number> | null): BoardContext['canBuild'] {
  if (!resources) return { road: false, settlement: false, city: false, devCard: false }
  const w = resources.wood    ?? 0
  const c = resources.clay    ?? 0
  const l = resources.wool    ?? 0
  const t = resources.cereal  ?? 0
  const m = resources.mineral ?? 0

  return {
    road:       w >= 1 && c >= 1,
    settlement: w >= 1 && c >= 1 && l >= 1 && t >= 1,
    city:       m >= 3 && t >= 2,
    devCard:    m >= 1 && l >= 1 && t >= 1,
  }
}

/** Pre-compute current VP from board summary */
export function computeVP(boardSummary: string, devCards: Record<string, number> | null | undefined): { summary: string; total: number } {
  let settlements = 0
  let cities = 0

  const settMatch = boardSummary.match(/TU COLOR[^]*?(\d+)\s+poblado/)
  const cityMatch = boardSummary.match(/TU COLOR[^]*?(\d+)\s+ciudad/)
  if (settMatch) settlements = parseInt(settMatch[1])
  if (cityMatch)  cities     = parseInt(cityMatch[1])

  const structureVP = settlements * 1 + cities * 2
  const cardVP      = devCards?.vp ?? 0
  const totalVP     = structureVP + cardVP

  const parts: string[] = []
  if (settlements > 0) parts.push(`${settlements} poblado${settlements > 1 ? 's' : ''} × 1 PV = ${settlements} PV`)
  if (cities > 0)      parts.push(`${cities} ciudad${cities > 1 ? 'es' : ''} × 2 PV = ${cities * 2} PV`)
  if (cardVP > 0)      parts.push(`${cardVP} carta${cardVP > 1 ? 's' : ''} VP oculta = ${cardVP} PV`)
  if (parts.length === 0) parts.push('Sin piezas en el tablero aún')

  return {
    summary: `${parts.join(' + ')} → TOTAL = ${totalVP} PV (necesitas 10 para ganar)`,
    total: totalVP,
  }
}

/** Pre-compute which resources the player produces per dice number */
export function computeProductionTable(boardSummary: string): string {
  const mySection = boardSummary.match(/TU COLOR[^]*?(?=\n[A-Z]|$)/)
  if (!mySection) return 'Sin posiciones propias en el tablero'

  const tokenRe = /(\w+)\((\d+)=(\d+)pts(,LADRÓN)?\)/g
  const byNumber: Map<number, { terrains: string[]; blocked: boolean }> = new Map()

  let match
  while ((match = tokenRe.exec(mySection[0])) !== null) {
    const [, terrain, numStr, , robber] = match
    const num = parseInt(numStr)
    if (num < 2 || num > 12 || num === 7) continue
    if (!byNumber.has(num)) byNumber.set(num, { terrains: [], blocked: false })
    const entry = byNumber.get(num)!
    if (!entry.terrains.includes(terrain)) entry.terrains.push(terrain)
    if (robber) entry.blocked = true
  }

  if (byNumber.size === 0) return 'No hay hexágonos con número asociados a tus piezas'

  const lines: string[] = []
  for (const [num, { terrains, blocked }] of [...byNumber.entries()].sort((a, b) => a[0] - b[0])) {
    const label = blocked ? ` (BLOQUEADO por ladrón)` : ''
    lines.push(`  Dado ${num}: produces ${terrains.join(' + ')}${label}`)
  }
  return lines.join('\n')
}

/** Pre-compute turn estimates for each buildable thing based on production table */
export function computeTurnsEstimate(boardSummary: string, resources: Record<string, number> | null): string {
  const DICE_PROB: Record<number, number> = { 2:1,3:2,4:3,5:4,6:5,8:5,9:4,10:3,11:2,12:1 }
  const RESOURCE_MAP: Record<string, string> = {
    arcilla:'clay', barro:'clay', ladrillo:'clay',
    madera:'wood', bosque:'wood', 'leña':'wood',
    trigo:'cereal', cereal:'cereal', grano:'cereal',
    lana:'wool', pasto:'wool', oveja:'wool',
    mineral:'mineral', roca:'mineral', piedra:'mineral',
  }

  const mySection = boardSummary.match(/TU COLOR[^]*?(?=\n[A-Z]|$)/)
  if (!mySection) return ''

  const prodProb: Record<string, number> = {}
  const tokenRe = /(\w+)\((\d+)=\d+pts(?:,LADRÓN)?\)/g
  let m
  while ((m = tokenRe.exec(mySection[0])) !== null) {
    const terrain = m[1].toLowerCase()
    const num = parseInt(m[2])
    if (num < 2 || num > 12 || num === 7) continue
    const res = RESOURCE_MAP[terrain] ?? RESOURCE_MAP[terrain.normalize('NFD').replace(/[\u0300-\u036f]/g, '')]
    if (!res) continue
    prodProb[res] = (prodProb[res] ?? 0) + (DICE_PROB[num] ?? 0)
  }

  if (Object.keys(prodProb).length === 0) return ''

  const res = resources ?? {}
  const have = (r: string) => res[r] ?? 0

  function turnsFor(need: Record<string, number>): number {
    let maxTurns = 0
    for (const [r, needed] of Object.entries(need)) {
      const curr = have(r)
      const missing = Math.max(0, needed - curr)
      if (missing === 0) continue
      const prob = prodProb[r] ?? 0
      if (prob === 0) return 999
      const turns = Math.ceil(missing * 36 / prob)
      maxTurns = Math.max(maxTurns, turns)
    }
    return maxTurns
  }

  const turnsRoad       = turnsFor({ wood:1, clay:1 })
  const turnsSettlement = turnsFor({ wood:1, clay:1, wool:1, cereal:1 })
  const turnsCity       = turnsFor({ mineral:3, cereal:2 })
  const turnsDevCard    = turnsFor({ mineral:1, wool:1, cereal:1 })

  const fmt = (t: number) => t === 0 ? 'ahora mismo (tiene recursos)' : t === 999 ? 'imposible (no produce ese recurso)' : `~${t} turnos`

  return `ESTIMACIÓN DE TURNOS (pre-calculado, úsalo directamente):
  Camino:           ${fmt(turnsRoad)}
  Poblado:          ${fmt(turnsSettlement)}
  Ciudad:           ${fmt(turnsCity)}
  Carta desarrollo: ${fmt(turnsDevCard)}`
}

/**
 * Main entry: compute full board context from coachState.
 * Returns null if no board is configured.
 */
export function computeBoardContext(coachState?: CoachState): BoardContext | null {
  if (!coachState?.boardSummary || coachState.boardSummary === 'Tablero vacío') return null

  const resourceLine = coachState.resources
    ? Object.entries(coachState.resources)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${RES_ES[k] ?? k}×${v}`)
        .join(', ') || 'ninguno'
    : 'no especificados aún'

  const turnBlock = coachState.turn
    ? `\nTURNO ACTUAL: ${coachState.turn}`
    : ''

  const devBlock = coachState.devCards && Object.values(coachState.devCards).some(v => v > 0)
    ? `\nCARTAS DE DESARROLLO EN MANO: ${
        Object.entries(coachState.devCards)
          .filter(([,v]) => v > 0)
          .map(([k,v]) => {
            const names: Record<string,string> = { knight:'Caballero', monopoly:'Monopolio', year_of_plenty:'Año Abundancia', road_building:'Construcción Caminos', vp:'Punto Victoria' }
            return `${names[k]??k}×${v}`
          }).join(', ')
      }`
    : ''

  const vp = computeVP(coachState.boardSummary, coachState.devCards)

  return {
    actions: computeActions(coachState.resources),
    canBuild: computeCanBuild(coachState.resources),
    vpSummary: vp.summary,
    vpTotal: vp.total,
    productionTable: computeProductionTable(coachState.boardSummary),
    turnsEstimate: computeTurnsEstimate(coachState.boardSummary, coachState.resources ?? null),
    resourceLine,
    turnBlock,
    devBlock,
  }
}
