/**
 * boardGeometry.ts — Fuente única de verdad para la geometría del tablero estándar de Catan.
 *
 * Antes de este módulo, TERRAIN_ORDER, NUMBERS, HEX_CENTERS, VERT_TO_HEXES etc.
 * estaban copiados en 4 archivos distintos. Ahora se importan desde aquí.
 *
 * Archivos que importan de este módulo:
 *   - app/components/coach/BoardOverlay.tsx
 *   - app/components/ChatInterface.tsx
 *   - app/api/coach-recommend/route.ts
 *   - src/lib/diceProduction.ts
 */

// ─── Geometría SVG ────────────────────────────────────────────────────────────
export const R       = 40                      // radio hex (centro → vértice)
export const W       = Math.sqrt(3) * R        // ancho hex ≈ 69.28
export const ROW_H   = 1.5 * R                 // distancia vertical entre filas = 60
export const SVG_W   = 390
export const PAD_TOP = 50

export const ROWS: { n: number; colStart: number }[] = [
  { n: 3, colStart: 1 },    // fila 0 — 3 hexes
  { n: 4, colStart: 0.5 },  // fila 1
  { n: 5, colStart: 0 },    // fila 2 (más ancha)
  { n: 4, colStart: 0.5 },  // fila 3
  { n: 3, colStart: 1 },    // fila 4
]

// Centro x de columna 0 para la fila más ancha (5 hexes), centrado en SVG_W
export const X0 = (SVG_W - 5 * W) / 2 + W / 2   // ≈ 56.44

// Ángulos de vértices hex (pointy-top: 30°, 90°, 150°, 210°, 270°, 330°)
export const ANGLES = [30, 90, 150, 210, 270, 330].map(d => (d * Math.PI) / 180)

// ─── Tablero estándar principiantes (desierto en el centro, idx=9) ─────────────
export const TERRAIN_ORDER = [
  'mineral', 'wool',    'wood',
  'cereal',  'clay',    'wool',   'clay',
  'clay',    'cereal',  'desert', 'wood',  'mineral',
  'wood',    'mineral', 'cereal', 'wool',
  'cereal',  'wood',    'wool',
] as const

export type TerrainType = typeof TERRAIN_ORDER[number]

export const NUMBERS = [10, 2, 9, 12, 6, 4, 10, 9, 11, 0, 3, 8, 8, 3, 4, 5, 5, 6, 11]

export const DOTS: Record<number, number> = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
}

// Coordenadas axiales (q,r) para cada uno de los 19 hexes (para la API Python)
export const HEX_COORDS: { q: number; r: number }[] = [
  { q: -2, r: 0  }, { q: -1, r: -1 }, { q: 0, r: -2 },
  { q: -2, r: 1  }, { q: -1, r: 0  }, { q: 0, r: -1 }, { q: 1, r: -2 },
  { q: -2, r: 2  }, { q: -1, r: 1  }, { q: 0, r: 0  }, { q: 1, r: -1 }, { q: 2, r: -2 },
  { q: -1, r: 2  }, { q: 0, r: 1   }, { q: 1, r: 0  }, { q: 2, r: -1 },
  { q: 0,  r: 2  }, { q: 1, r: 1   }, { q: 2, r: 0  },
]

// Nombres en español
export const TERRAIN_NAMES: Record<string, string> = {
  clay: 'arcilla', mineral: 'mineral', wood: 'madera',
  cereal: 'trigo', wool: 'lana', desert: 'desierto',
}
export const RESOURCE_NAMES: Record<string, string> = {
  clay: 'Arcilla', mineral: 'Mineral', wood: 'Madera', cereal: 'Trigo', wool: 'Lana',
}
export const COLOR_NAMES: Record<string, string> = {
  red: 'Rojo', blue: 'Azul', orange: 'Naranja', white: 'Blanco',
}

// ─── Centros de hexes (calculados una vez) ────────────────────────────────────
export const HEX_CENTERS: [number, number][] = []
for (let row = 0; row < ROWS.length; row++) {
  for (let col = 0; col < ROWS[row].n; col++) {
    const cx = X0 + (ROWS[row].colStart + col) * W
    const cy = PAD_TOP + row * ROW_H
    HEX_CENTERS.push([cx, cy])
  }
}

// ─── Funciones utilitarias ────────────────────────────────────────────────────
export function approxKey(x: number, y: number): string {
  return `${Math.round(x)},${Math.round(y)}`
}

export function hexVertices(cx: number, cy: number): [number, number][] {
  return ANGLES.map(a => [cx + R * Math.cos(a), cy + R * Math.sin(a)] as [number, number])
}

export function polyPoints(verts: [number, number][]): string {
  return verts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

// ─── Grafos pre-computados (singletons — se calculan una vez al importar) ─────
function buildAllGraphs() {
  const vertMap      = new Map<string, { id: number; x: number; y: number }>()
  const vertToHexes  = new Map<number, number[]>()
  const edgeToHexes  = new Map<string, number[]>()
  const adjacency    = new Map<number, Set<number>>()
  let vId = 0

  HEX_CENTERS.forEach(([cx, cy], hi) => {
    const verts = hexVertices(cx, cy)
    const vIds: number[] = []

    for (const [vx, vy] of verts) {
      const k = approxKey(vx, vy)
      if (!vertMap.has(k)) vertMap.set(k, { id: vId++, x: vx, y: vy })
      const vid = vertMap.get(k)!.id
      vIds.push(vid)
      if (!vertToHexes.has(vid)) vertToHexes.set(vid, [])
      const arr = vertToHexes.get(vid)!
      if (!arr.includes(hi)) arr.push(hi)
    }

    // Aristas del hex
    for (let i = 0; i < 6; i++) {
      const a = vIds[i], b = vIds[(i + 1) % 6]
      const [lo, hi2] = a < b ? [a, b] : [b, a]
      const eid = `${lo}_${hi2}`
      if (!edgeToHexes.has(eid)) edgeToHexes.set(eid, [])
      const earr = edgeToHexes.get(eid)!
      if (!earr.includes(hi)) earr.push(hi)
      // Adyacencia
      if (!adjacency.has(a)) adjacency.set(a, new Set())
      if (!adjacency.has(b)) adjacency.set(b, new Set())
      adjacency.get(a)!.add(b)
      adjacency.get(b)!.add(a)
    }
  })

  return {
    vertices: [...vertMap.values()].sort((a, b) => a.id - b.id),
    vertToHexes,
    edgeToHexes,
    adjacency,
  }
}

const _graphs = buildAllGraphs()

/** vertexId → índices de hexes adyacentes */
export const VERT_TO_HEXES: Map<number, number[]>      = _graphs.vertToHexes
/** "lo_hi" → índices de hexes adyacentes */
export const EDGE_TO_HEXES: Map<string, number[]>      = _graphs.edgeToHexes
/** vertexId → Set de vertexIds adyacentes (para regla de distancia) */
export const ADJACENCY:     Map<number, Set<number>>   = _graphs.adjacency
/** Lista de todos los vértices con coordenadas SVG */
export const VERTICES: { id: number; x: number; y: number }[] = _graphs.vertices

// ─── Descripciones humanas de posiciones ─────────────────────────────────────
export function describeVertex(vid: number): string {
  const hexIndices = VERT_TO_HEXES.get(vid) ?? []
  const parts = hexIndices
    .filter(hi => NUMBERS[hi] > 0 && TERRAIN_ORDER[hi] !== 'desert')
    .map(hi => {
      const terrain = TERRAIN_ORDER[hi]
      const num  = NUMBERS[hi]
      const dots = DOTS[num] ?? 0
      return `${terrain}(${num},${dots}pts)`
    })
  return parts.length > 0 ? parts.join('+') : 'sin producción'
}

export function describeEdge(edgeId: string): string {
  const [aStr, bStr] = edgeId.replace(/^e/, '').split('_')
  const a = parseInt(aStr), b = parseInt(bStr)
  return `entre [${describeVertex(a)}] y [${describeVertex(b)}]`
}

/** Vértices al final de los caminos propios que aún no tienen pieza — candidatos de expansión */
export function buildFrontierVertices(
  pieces: Record<string, { type: string; color: string }>,
  myColor: string,
): string[] {
  const myVerts = new Set<number>()
  for (const [key, p] of Object.entries(pieces)) {
    if (p.color !== myColor) continue
    if (key.startsWith('v')) myVerts.add(parseInt(key.slice(1)))
  }
  const roadVerts = new Set<number>()
  for (const [key, p] of Object.entries(pieces)) {
    if (p.color !== myColor || !key.startsWith('e')) continue
    key.slice(1).split('_').map(Number).forEach(v => roadVerts.add(v))
  }
  const frontier: string[] = []
  for (const vid of roadVerts) {
    if (!myVerts.has(vid)) frontier.push(`v${vid}: ${describeVertex(vid)}`)
  }
  return frontier.slice(0, 5)
}

// ─── buildBoardSummary — texto para el LLM ───────────────────────────────────
export function buildBoardSummary(
  pieces:      Record<string, { type: 'settlement' | 'city' | 'road'; color: string }>,
  myColor:     string,
  assignments: string[],
  resources:   Record<string, number> | null,
  robberHex:   number,
): string {
  if (Object.keys(pieces).length === 0) return 'Tablero vacío'

  const myLabel = COLOR_NAMES[myColor] ?? myColor

  const byColor: Record<string, { settlements: string[]; cities: string[]; roads: string[] }> = {}

  for (const [key, piece] of Object.entries(pieces)) {
    const c = piece.color
    if (!byColor[c]) byColor[c] = { settlements: [], cities: [], roads: [] }

    let hexIndices: number[] = []
    if (key.startsWith('v'))      hexIndices = VERT_TO_HEXES.get(parseInt(key.slice(1))) ?? []
    else if (key.startsWith('e')) hexIndices = EDGE_TO_HEXES.get(key.slice(1)) ?? []

    const richHexDescs = hexIndices
      .filter(hi => TERRAIN_ORDER[hi] !== 'desert' && NUMBERS[hi] > 0)
      .map(hi => {
        const t   = TERRAIN_NAMES[TERRAIN_ORDER[hi]] ?? TERRAIN_ORDER[hi]
        const n   = NUMBERS[hi]
        const d   = DOTS[n] ?? 0
        const rob = robberHex === hi ? ',LADRÓN' : ''
        return `${t}(${n}=${d}pts${rob})`
      })

    const totalDots = hexIndices
      .filter(hi => TERRAIN_ORDER[hi] !== 'desert' && NUMBERS[hi] > 0 && robberHex !== hi)
      .reduce((acc, hi) => acc + (DOTS[NUMBERS[hi]] ?? 0), 0)

    const desc = richHexDescs.length > 0
      ? `[${richHexDescs.join('+')}→${totalDots}pts/turno]`
      : '[sin producción]'

    if (piece.type === 'settlement') byColor[c].settlements.push(desc)
    else if (piece.type === 'city')  byColor[c].cities.push(desc + '×2')
    else if (piece.type === 'road')  byColor[c].roads.push(desc)
  }

  const playerOrder = assignments.length > 0 ? assignments : Object.keys(byColor)
  const playerLines: string[] = []

  for (const color of playerOrder) {
    const s = byColor[color]
    if (!s) continue
    const label = COLOR_NAMES[color] ?? color
    const isMe  = color === myColor

    // Producción total del jugador
    const myPieces = Object.entries(pieces).filter(([, p]) => p.color === color)
    const producedResources = new Set<string>()
    let totalProdPts = 0
    for (const [key] of myPieces) {
      const hexInds = key.startsWith('v')
        ? VERT_TO_HEXES.get(parseInt(key.slice(1))) ?? []
        : EDGE_TO_HEXES.get(key.slice(1)) ?? []
      for (const hi of hexInds) {
        if (TERRAIN_ORDER[hi] !== 'desert' && NUMBERS[hi] > 0 && robberHex !== hi) {
          producedResources.add(TERRAIN_NAMES[TERRAIN_ORDER[hi]] ?? TERRAIN_ORDER[hi])
          totalProdPts += DOTS[NUMBERS[hi]] ?? 0
        }
      }
    }

    const parts: string[] = []
    if (s.settlements.length > 0) parts.push(`${s.settlements.length} poblado${s.settlements.length > 1 ? 's' : ''}: ${s.settlements.join(' y ')}`)
    if (s.cities.length > 0)      parts.push(`${s.cities.length} ciudad${s.cities.length > 1 ? 'es' : ''}: ${s.cities.join(' y ')}`)
    if (s.roads.length > 0)       parts.push(`${s.roads.length} camino${s.roads.length > 1 ? 's' : ''}`)
    if (producedResources.size > 0) parts.push(`produce: ${[...producedResources].join('+')} (~${totalProdPts}pts/turno)`)

    if (parts.length > 0) {
      playerLines.push(`${isMe ? `TU COLOR (${label})` : label}:\n  ${parts.join('\n  ')}`)
    }
  }

  const RES_ES: Record<string, string> = { wood: 'madera', clay: 'arcilla', cereal: 'trigo', wool: 'lana', mineral: 'mineral' }
  const resourceLine = resources
    ? Object.entries(resources).filter(([, v]) => v > 0).map(([k, v]) => `${RES_ES[k] ?? k}×${v}`).join(', ')
    : null

  let robberLine = ''
  if (robberHex !== 9) {
    const rTerrain = TERRAIN_ORDER[robberHex] ?? 'desconocido'
    const rNum     = NUMBERS[robberHex] ?? 0
    robberLine = `\nLADRÓN: bloqueando ${TERRAIN_NAMES[rTerrain] ?? rTerrain}(${rNum}) — ese hex NO produce`
  }

  let summary = `POSICIONES EN EL TABLERO:\n${playerLines.join('\n') || 'Sin piezas colocadas'}`
  if (resourceLine) summary += `\n\nRECURSOS EN MANO (${myLabel.toUpperCase()}): ${resourceLine}`
  if (robberLine)   summary += robberLine

  return summary
}

// ─── Payload para la API de Python (coach-recommend) ─────────────────────────
const STANDARD_HEXES_PAYLOAD = TERRAIN_ORDER.map((terrain, i) => ({
  q: HEX_COORDS[i].q,
  r: HEX_COORDS[i].r,
  resource: terrain === 'mineral' ? 'ore'
    : terrain === 'wool'    ? 'sheep'
    : terrain === 'wood'    ? 'wood'
    : terrain === 'cereal'  ? 'wheat'
    : terrain === 'clay'    ? 'brick'
    : 'desert',
  number:      NUMBERS[i] > 0 ? NUMBERS[i] : null,
  probability: NUMBERS[i] > 0 ? (DOTS[NUMBERS[i]] ?? 0) / 36 : 0,
}))

export { STANDARD_HEXES_PAYLOAD }

/** Payload de vértices con topología para la API Python */
export function buildVerticesPayload(vertexIds: number[]) {
  return [...new Set(vertexIds)].map(vid => ({
    vertex_id:      vid,
    adjacent_hexes: (VERT_TO_HEXES.get(vid) ?? [])
      .filter(hi => hi < HEX_COORDS.length)
      .map(hi => [HEX_COORDS[hi].q, HEX_COORDS[hi].r] as [number, number]),
  }))
}
