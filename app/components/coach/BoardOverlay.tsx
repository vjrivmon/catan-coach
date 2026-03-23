'use client'

import { useState, useMemo, useCallback, useRef } from 'react'

// ─── Geometry ──────────────────────────────────────────────────────────────────
const R = 40          // hex radius (center → vertex)
const W = Math.sqrt(3) * R   // hex width  ≈ 69.28
const ROW_H = 1.5 * R        // vertical dist between row centers = 60

// SVG canvas
const SVG_W = 390
const PAD_TOP = 50    // space for ports (computed geometrically, minimal margin needed)

// Board rows: [hexCount, xStart column offset]
// even rows align at 0, 1, 2...  odd rows offset by 0.5
//   row  count  col-start
const ROWS = [
  { n: 3, colStart: 1 },   // row 0 - 3 hexes, starting at column 1
  { n: 4, colStart: 0.5 }, // row 1
  { n: 5, colStart: 0 },   // row 2 (widest)
  { n: 4, colStart: 0.5 }, // row 3
  { n: 3, colStart: 1 },   // row 4
]

// Center x of column 0 for widest row (5 hexes)
// total width of 5 hexes = 5*W, centered in SVG_W
const X0 = (SVG_W - 5 * W) / 2 + W / 2   // ≈ 56.44

function hexCenter(row: number, col: number): [number, number] {
  const { colStart } = ROWS[row]
  const cx = X0 + (colStart + col) * W
  const cy = PAD_TOP + row * ROW_H
  return [cx, cy]
}

// All 19 hex centers in board order
const HEX_CENTERS: [number, number][] = []
for (let r = 0; r < ROWS.length; r++) {
  for (let c = 0; c < ROWS[r].n; c++) {
    HEX_CENTERS.push(hexCenter(r, c))
  }
}

// Pointy-top hex vertices (angles: 30,90,150,210,270,330°)
const ANGLES = [30, 90, 150, 210, 270, 330].map(d => (d * Math.PI) / 180)
function hexVertices(cx: number, cy: number): [number, number][] {
  return ANGLES.map(a => [cx + R * Math.cos(a), cy + R * Math.sin(a)] as [number, number])
}
function polyPoints(verts: [number, number][]): string {
  return verts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

// ─── Board data (tablero estándar de principiantes — desierto en el centro) ───
const TERRAIN_ORDER = [
  'mineral','wool','wood',           // fila 0 (3 hexes)
  'cereal','clay','wool','clay',     // fila 1 (4 hexes)
  'clay','cereal','desert','wood','mineral', // fila 2 — desert en posición central (idx 9)
  'wood','mineral','cereal','wool',  // fila 3 (4 hexes)
  'cereal','wood','wool',            // fila 4 (3 hexes)
] as const

type TerrainType = typeof TERRAIN_ORDER[number]

// Standard numbers: 2×1, 3×2, 4×2, 5×2, 6×2, 8×2, 9×2, 10×2, 11×2, 12×1
const NUMBERS = [10,2,9, 12,6,4,10, 9,11,0,3,8, 8,3,4,5, 5,6,11]

const TEXTURE: Record<TerrainType, string> = {
  clay:    '/board-textures/quarry.jpg',
  mineral: '/board-textures/mountain.jpg',
  wood:    '/board-textures/forest.jpg',
  cereal:  '/board-textures/cereal.jpg',
  wool:    '/board-textures/wool.jpg',
  desert:  '/board-textures/desert.jpg',
}

// ─── Vertex / Edge deduplication ──────────────────────────────────────────────
function approxKey(x: number, y: number) {
  return `${Math.round(x)},${Math.round(y)}`
}

type Vertex = { id: number; x: number; y: number }
type Edge   = { id: string; x1: number; y1: number; x2: number; y2: number }

function buildGraph() {
  const vertMap = new Map<string, Vertex>()
  const edgeMap = new Map<string, Edge>()
  let vId = 0

  for (const [cx, cy] of HEX_CENTERS) {
    const verts = hexVertices(cx, cy)
    const vIds: number[] = []

    for (const [vx, vy] of verts) {
      const k = approxKey(vx, vy)
      if (!vertMap.has(k)) vertMap.set(k, { id: vId++, x: vx, y: vy })
      vIds.push(vertMap.get(k)!.id)
    }

    // 6 edges per hex
    for (let i = 0; i < 6; i++) {
      const a = vIds[i], b = vIds[(i + 1) % 6]
      const [lo, hi] = a < b ? [a, b] : [b, a]
      const ek = `${lo}_${hi}`
      if (!edgeMap.has(ek)) {
        const va = [...vertMap.values()].find(v => v.id === lo)!
        const vb = [...vertMap.values()].find(v => v.id === hi)!
        edgeMap.set(ek, { id: ek, x1: va.x, y1: va.y, x2: vb.x, y2: vb.y })
      }
    }
  }

  // adjacency: vertex id → set of adjacent vertex ids (connected by one edge)
  const adjacency = new Map<number, Set<number>>()
  for (const [, edge] of edgeMap) {
    const [a, b] = edge.id.split('_').map(Number)
    if (!adjacency.has(a)) adjacency.set(a, new Set())
    if (!adjacency.has(b)) adjacency.set(b, new Set())
    adjacency.get(a)!.add(b)
    adjacency.get(b)!.add(a)
  }

  return {
    vertices:  [...vertMap.values()],
    edges:     [...edgeMap.values()],
    adjacency,
  }
}

// ─── Ports (standard beginner board) ──────────────────────────────────────────
// Each port defined by (hexIndex, edgeIndex) so position is computed exactly
// Edges of a pointy-top hex: 0=BR, 1=BL, 2=L, 3=TL, 4=TR, 5=R
type PortType = 'mineral'|'clay'|'cereal'|'wool'|'wood'|'3:1'
interface PortDef { hexIdx: number; edgeIdx: number; type: PortType }

const PORT_DEFS: PortDef[] = [
  { hexIdx: 0,  edgeIdx: 3, type: 'mineral' }, // top-left (ore 2:1)
  { hexIdx: 1,  edgeIdx: 3, type: '3:1'     }, // top-center (hex 1, sin vértice compartido)
  { hexIdx: 2,  edgeIdx: 4, type: 'wood'    }, // top-right (wood 2:1)
  { hexIdx: 6,  edgeIdx: 5, type: '3:1'     }, // right-top
  { hexIdx: 11, edgeIdx: 5, type: 'cereal'  }, // right-mid (wheat 2:1)
  { hexIdx: 15, edgeIdx: 0, type: '3:1'     }, // right-bottom
  { hexIdx: 18, edgeIdx: 0, type: 'clay'    }, // bottom-right (brick 2:1)
  { hexIdx: 16, edgeIdx: 1, type: '3:1'     }, // bottom-left
  { hexIdx: 7,  edgeIdx: 2, type: 'wool'    }, // left (sheep 2:1)
]

const PORT_EMOJI: Record<PortType, string> = {
  mineral: '⛏', clay: '🧱', cereal: '🌾', wool: '🐑', wood: '🪵', '3:1': '⚖',
}

/** Compute port geometry from hex/edge definition */
function portGeom(def: PortDef) {
  const [cx, cy] = HEX_CENTERS[def.hexIdx]
  const verts = hexVertices(cx, cy)
  const [vx1, vy1] = verts[def.edgeIdx]
  const [vx2, vy2] = verts[(def.edgeIdx + 1) % 6]
  const mx = (vx1 + vx2) / 2
  const my = (vy1 + vy2) / 2
  const dx = mx - cx, dy = my - cy
  const len = Math.sqrt(dx * dx + dy * dy)
  const push = 24
  return { vx1, vy1, vx2, vy2, px: mx + push * dx / len, py: my + push * dy / len }
}

// ─── Initial placement limits ─────────────────────────────────────────────────
const MAX_SETTLEMENTS = 2
const MAX_ROADS       = 4
// In Catan initial placement: 2 settlements + 2 roads each → 4 roads total per player
// Must place ALL before confirming
const MIN_SETTLEMENTS = MAX_SETTLEMENTS
const MIN_ROADS       = MAX_ROADS

function countByPlayer(pieces: Record<string, { type: string; color: string }>, color: string) {
  let s = 0, r = 0
  for (const p of Object.values(pieces)) {
    if (p.color !== color) continue
    if (p.type === 'settlement') s++
    else if (p.type === 'road')  r++
  }
  return { settlements: s, roads: r }
}

// ─── Colors ───────────────────────────────────────────────────────────────────
const PLAYER_COLORS: Record<string, string> = {
  red: '#ef4444', blue: '#3b82f6', orange: '#f97316', white: '#e5e7eb',
}
const COLOR_NAMES: Record<string, string> = {
  red: 'Rojo', blue: 'Azul', orange: 'Naranja', white: 'Blanco',
}

type Piece = { type: 'settlement' | 'city' | 'road'; color: string }

// ─── Component ────────────────────────────────────────────────────────────────
export interface BoardConfirmPayload {
  pieces:      Record<string, Piece>
  myColor:     string
  assignments: string[]   // [Tú, J2, J3?, J4?]
  robberHex:   number     // hex index 0-18, 9=desert default
}

interface BoardOverlayProps {
  onClose:            () => void
  onConfirm:          (payload: BoardConfirmPayload) => void
  initialPieces?:     Record<string, Piece>
  initialMyColor?:    string
  initialAssignments?: string[]
  initialRobberHex?:  number
}

export function BoardOverlay({ onClose, onConfirm, initialPieces = {}, initialMyColor, initialAssignments, initialRobberHex = 9 }: BoardOverlayProps) {
  // assignments[i] = color for player i: [Tú, J2, J3, J4]
  const ALL_COLORS = ['red','blue','orange','white'] as const
  const PLAYER_LABELS = ['Tú','J2','J3','J4']

  const [assignments, setAssignments] = useState<string[]>(() => {
    // 1. Prefer explicit assignments (restored from confirmed session)
    if (initialAssignments && initialAssignments.length > 0) return initialAssignments
    // 2. No prior context — fresh start
    return []
  })
  const [colorsConfirmed, setColorsConfirmed] = useState(
    (initialAssignments && initialAssignments.length > 0)
  )

  // Derived color → label map
  const colorToLabel: Record<string, string> = {}
  assignments.forEach((c, i) => { colorToLabel[c] = PLAYER_LABELS[i] })

  const myColor = assignments[0] ?? null
  const [selColor, setSelColor] = useState(
    (initialAssignments && initialAssignments.length > 0 ? initialAssignments[0] : null) ?? 'red'
  )
  // Cities disabled in initial placement phase — only settlements & roads
  const [selPiece, setSelPiece]     = useState<'settlement' | 'road'>('settlement')
  const [pieces, setPieces]         = useState<Record<string, Piece>>(initialPieces)
  const [warning, setWarning]       = useState<string | null>(null)
  // Robber — index of hex where ladrón sits (default: 9 = desert center)
  const [robberHex, setRobberHex]   = useState<number>(initialRobberHex)
  const [movingRobber, setMovingRobber] = useState(false)

  const { vertices, edges, adjacency } = useMemo(buildGraph, [])

  // lastTap prevents double-fire from pointerdown+click on mobile
  const lastTap = useRef(0)

  const showWarning = useCallback((msg: string) => {
    setWarning(msg)
    setTimeout(() => setWarning(null), 2500)
  }, [])

  const toggleVertex = useCallback((id: number) => {
    if (selPiece === 'road') return
    const now = Date.now()
    if (now - lastTap.current < 300) return
    lastTap.current = now
    const k = `v${id}`

    setPieces(p => {
      // Removing an existing own piece — always allowed
      if (p[k]?.color === selColor && p[k]?.type === selPiece) {
        const n = { ...p }
        delete n[k]
        return n
      }

      // Placing a new settlement — run rules
      const { settlements } = countByPlayer(p, selColor)

      // Rule 1: max 2 settlements per player in initial phase
      if (!p[k] && settlements >= MAX_SETTLEMENTS) {
        showWarning(`Máximo ${MAX_SETTLEMENTS} poblados por jugador en la colocación inicial`)
        return p
      }

      // Rule 2: distance rule — no adjacent vertex can have ANY settlement
      const neighbors = adjacency.get(id) ?? new Set<number>()
      for (const nid of neighbors) {
        if (p[`v${nid}`]?.type === 'settlement' || p[`v${nid}`]?.type === 'city') {
          showWarning('Debe haber al menos 2 caminos de distancia entre poblados')
          return p
        }
      }

      // Rule 3: vertex already occupied by another player
      if (p[k] && p[k].color !== selColor) {
        showWarning('Este vértice ya está ocupado por otro jugador')
        return p
      }

      const n = { ...p }
      n[k] = { type: 'settlement', color: selColor }
      return n
    })
  }, [selPiece, selColor, adjacency, showWarning])

  const toggleEdge = useCallback((id: string) => {
    if (selPiece !== 'road') return
    const now = Date.now()
    if (now - lastTap.current < 300) return
    lastTap.current = now
    const k = `e${id}`

    setPieces(p => {
      // Removing own road — always allowed
      if (p[k]?.color === selColor) {
        const n = { ...p }
        delete n[k]
        return n
      }

      // Rule: max 4 roads per player in initial phase
      const { roads } = countByPlayer(p, selColor)
      if (roads >= MAX_ROADS) {
        showWarning(`Máximo ${MAX_ROADS} caminos por jugador en la colocación inicial`)
        return p
      }

      // Rule: edge already occupied
      if (p[k] && p[k].color !== selColor) {
        showWarning('Esta arista ya está ocupada por otro jugador')
        return p
      }

      const n = { ...p }
      n[k] = { type: 'road', color: selColor }
      return n
    })
  }, [selPiece, selColor, showWarning])

  // Validation: each player must have at least MIN_SETTLEMENTS + MIN_ROADS
  const allPlayersReady = useMemo(() => {
    if (assignments.length === 0) return false
    return assignments.every(color => {
      const { settlements, roads } = countByPlayer(pieces, color)
      return settlements >= MIN_SETTLEMENTS && roads >= MIN_ROADS
    })
  }, [pieces, assignments])

  const pieceCount = Object.keys(pieces).length
  const svgH = PAD_TOP + 4 * ROW_H + R + 40  // ≈ 365

  return (
    <div className="flex flex-col h-full bg-stone-900">

      {/* Color assignment (sequential) or Player selector */}
      {!colorsConfirmed ? (
        /* Step-by-step color assignment */
        <div className="bg-stone-800 border-b border-stone-700 px-4 py-3 shrink-0">
          {(() => {
            const step = assignments.length   // 0=Tú, 1=J2, 2=J3
            const remaining = ALL_COLORS.filter(c => !assignments.includes(c))
            const label = step === 0 ? '¿Tu color?' : `¿Color de J${step + 1}?`

            // Step 3: J3 already picked, confirm J4 or skip
            if (step === 3) {
              const j4Color = remaining[0]
              return (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-stone-300 font-bold shrink-0">¿Hay J4?</span>
                  <button
                    onClick={() => { setAssignments([...assignments, j4Color]); setColorsConfirmed(true) }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-stone-600 text-xs font-bold text-stone-300 hover:border-stone-400 transition-colors">
                    <div className="w-4 h-4 rounded-full" style={{ background: PLAYER_COLORS[j4Color] }} />
                    Sí (somos 4)
                  </button>
                  <button
                    onClick={() => setColorsConfirmed(true)}
                    className="px-3 py-1.5 rounded-full border border-stone-600 text-xs text-stone-500 hover:text-stone-300 transition-colors">
                    No (somos 3)
                  </button>
                </div>
              )
            }

            const pickColor = (c: string) => {
              const next = [...assignments, c]
              setAssignments(next)
              if (step === 0) setSelColor(c)
              // After J3 picks (step 2), advance to step 3 (J4 confirmation)
              // colorsConfirmed stays false → step 3 renders
            }

            return (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-bold shrink-0 w-28 ${step === 0 ? 'text-amber-400' : 'text-stone-300'}`}>
                    {label}
                  </span>
                  <div className="flex gap-3">
                    {remaining.map(c => (
                      <button key={c}
                        onClick={() => pickColor(c)}
                        className="w-10 h-10 rounded-full border-2 border-stone-600 hover:scale-110 active:scale-95 transition-transform"
                        style={{ background: PLAYER_COLORS[c] }}
                      />
                    ))}
                  </div>
                </div>
                {/* Escape only at J2 step — at J3 step, must pick color first */}
                {step === 1 && (
                  <button onClick={() => setColorsConfirmed(true)}
                    className="self-start text-xs text-stone-500 hover:text-stone-300 transition-colors underline underline-offset-2">
                    No hay J3 ni J4 (somos 2)
                  </button>
                )}
              </div>
            )
          })()}
        </div>
      ) : (
        /* Player selector once colors assigned */
        <div className="bg-stone-800 border-b border-stone-700 px-3 py-2 flex items-center gap-2 shrink-0 overflow-x-auto">
          <span className="text-stone-500 text-xs shrink-0">Jugador:</span>
          {assignments.map((c, i) => (
            <button key={c} onClick={() => setSelColor(c)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold shrink-0 transition-all ${
                selColor === c ? 'bg-current/10' : 'border-stone-600 text-stone-400'
              }`}
              style={selColor === c ? { color: PLAYER_COLORS[c], borderColor: PLAYER_COLORS[c] } : {}}>
              <div className="w-2 h-2 rounded-full" style={{ background: PLAYER_COLORS[c] }} />
              {PLAYER_LABELS[i]}
            </button>
          ))}
        </div>
      )}

      {/* Piece selector + per-player status — only shown once colors confirmed */}
      {colorsConfirmed && (
        <div className="bg-stone-800 border-b border-stone-700 px-3 py-2 flex flex-col gap-2 shrink-0">
          {/* Piece type buttons — cities hidden in initial phase */}
          <div className="flex gap-2 items-center flex-wrap">
            {(['settlement','road'] as const).map(p => (
              <button key={p}
                onClick={() => { setSelPiece(p); setMovingRobber(false) }}
                className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                  selPiece === p && !movingRobber
                    ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                    : 'border-stone-600 text-stone-400 bg-stone-700'
                }`}>
                {p === 'settlement' ? 'Pueblo' : 'Camino'}
              </button>
            ))}
            {/* Mover ladrón button */}
            <button
              onClick={() => setMovingRobber(r => !r)}
              className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                movingRobber
                  ? 'border-red-500 text-red-400 bg-red-500/10'
                  : 'border-stone-600 text-stone-500 bg-stone-700'
              }`}>
              {movingRobber ? 'Cancelar' : 'Mover ladrón'}
            </button>
            {movingRobber && (
              <span className="text-red-400 text-xs">Toca un hex para mover el ladrón</span>
            )}
            {!movingRobber && <span className="text-stone-600 text-xs">Ciudad: no disponible en colocación inicial</span>}
          </div>

          {/* Per-player status — desktop visible always, mobile compact */}
          <div className="flex gap-3 flex-wrap">
            {assignments.map((color) => {
              const { settlements, roads } = countByPlayer(pieces, color)
              const sOk = settlements >= MIN_SETTLEMENTS
              const rOk = roads >= MIN_ROADS
              const done = sOk && rOk
              // Colors: green = complete, amber = partial, stone = zero
              const sColor = settlements === 0 ? 'text-stone-500' : sOk ? 'text-green-400' : 'text-amber-400'
              const rColor = roads === 0 ? 'text-stone-500' : rOk ? 'text-green-400' : 'text-amber-400'
              return (
                <div key={color} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PLAYER_COLORS[color] }} />
                  <span className="text-xs text-stone-400">{COLOR_NAMES[color] ?? color}:</span>
                  <span className={`text-xs font-mono ${sColor}`}>
                    <span className="hidden sm:inline">{settlements}/{MAX_SETTLEMENTS} Poblados</span>
                    <span className="sm:hidden">{settlements}/{MAX_SETTLEMENTS}P</span>
                  </span>
                  <span className={`text-xs font-mono ${rColor}`}>
                    <span className="hidden sm:inline">{roads}/{MAX_ROADS} Caminos</span>
                    <span className="sm:hidden">{roads}/{MAX_ROADS}C</span>
                  </span>
                  {done ? (
                    <span className="text-green-500 text-xs">✓</span>
                  ) : (
                    <span className="text-amber-500 text-xs">·</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Warning toast */}
          {warning && (
            <div className="bg-red-950/60 border border-red-700 rounded-lg px-3 py-1.5 text-red-300 text-xs">
              {warning}
            </div>
          )}
        </div>
      )}

      {/* SVG Board — locked until colors confirmed */}
      {colorsConfirmed && <div className="flex-1 flex justify-center items-center overflow-hidden" style={{ background: '#0f1f40' }}>
        <svg
          viewBox={`-22 -14 ${SVG_W + 44} ${svgH + 28}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block', width: '100%', height: '100%', maxWidth: 420 }}
        >
          <defs>
            {/* Water/background pattern */}
            <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1e3a6e" />
              <stop offset="100%" stopColor="#0f1f40" />
            </radialGradient>

            {/* Hex clip paths */}
            {HEX_CENTERS.map(([cx, cy], i) => (
              <clipPath key={i} id={`hclip${i}`}>
                <polygon points={polyPoints(hexVertices(cx, cy))} />
              </clipPath>
            ))}
          </defs>

          {/* ── Hexes ── */}
          {HEX_CENTERS.map(([cx, cy], i) => {
            const terrain = TERRAIN_ORDER[i] as TerrainType
            const num     = NUMBERS[i]
            const verts   = hexVertices(cx, cy)
            const pts     = polyPoints(verts)
            const imgUrl  = TEXTURE[terrain]

            const hasRobber = robberHex === i

            return (
              <g key={i}
                onClick={() => {
                  if (movingRobber) { setRobberHex(i); setMovingRobber(false) }
                }}
                style={{ cursor: movingRobber ? 'pointer' : 'default' }}
              >
                {/* Texture fill via image + clipPath */}
                <image
                  href={imgUrl}
                  x={cx - W / 2} y={cy - R}
                  width={W} height={2 * R}
                  clipPath={`url(#hclip${i})`}
                  preserveAspectRatio="xMidYMid slice"
                />
                {/* Robber overlay — darkens the hex */}
                {hasRobber && (
                  <polygon points={pts} fill="rgba(0,0,0,0.45)" stroke="#ef4444" strokeWidth={2} />
                )}
                {/* Robber hover hint */}
                {movingRobber && !hasRobber && (
                  <polygon points={pts} fill="rgba(239,68,68,0.15)" stroke="rgba(239,68,68,0.5)" strokeWidth={1.5} />
                )}
                {/* Hex border */}
                {!hasRobber && <polygon points={pts} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth={1} />}

                {/* Number token */}
                {num > 0 && (
                  <g>
                    <circle cx={cx} cy={cy} r={14} fill="rgba(255,255,255,0.92)" />
                    <text
                      x={cx} y={cy + 4}
                      textAnchor="middle"
                      fontSize={11} fontWeight="bold"
                      fill={num === 6 || num === 8 ? '#dc2626' : '#1c1917'}
                    >
                      {num}
                    </text>
                    {/* Probability dots for 6 and 8 */}
                    {(num === 6 || num === 8) && (
                      <>
                        <circle cx={cx - 5} cy={cy + 8} r={1.5} fill="#dc2626" />
                        <circle cx={cx}     cy={cy + 8} r={1.5} fill="#dc2626" />
                        <circle cx={cx + 5} cy={cy + 8} r={1.5} fill="#dc2626" />
                      </>
                    )}
                  </g>
                )}
                {/* Desert text */}
                {terrain === 'desert' && !hasRobber && (
                  <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.6)">Desierto</text>
                )}
                {/* Robber icon */}
                {hasRobber && (
                  <g>
                    <circle cx={cx} cy={cy - 2} r={11} fill="#1c1917" stroke="#ef4444" strokeWidth={1.5} />
                    <text x={cx} y={cy + 3} textAnchor="middle" fontSize={13}>🦹</text>
                  </g>
                )}
              </g>
            )
          })}

          {/* ── Ports ── */}
          {PORT_DEFS.map((def, i) => {
            const { vx1, vy1, vx2, vy2, px, py } = portGeom(def)
            const isGeneric = def.type === '3:1'
            const emoji = PORT_EMOJI[def.type]
            const ratio = isGeneric ? '3:1' : '2:1'
            const mx = (vx1 + vx2) / 2, my = (vy1 + vy2) / 2
            const pw = 36, ph = 18
            return (
              <g key={i}>
                {/* Connector line: pill → edge midpoint */}
                <line x1={px} y1={py} x2={mx} y2={my}
                  stroke="rgba(251,191,36,0.55)" strokeWidth={1.5} strokeDasharray="3 2"/>
                {/* Vertex access dots */}
                <circle cx={vx1} cy={vy1} r={4} fill="#fbbf24" opacity={0.8}/>
                <circle cx={vx2} cy={vy2} r={4} fill="#fbbf24" opacity={0.8}/>
                {/* Port pill */}
                <rect x={px - pw/2} y={py - ph/2} width={pw} height={ph} rx={5}
                  fill="rgba(15,23,42,0.88)" stroke="rgba(251,191,36,0.6)" strokeWidth={1}/>
                <text x={px - 7} y={py + 5} textAnchor="middle" fontSize={10}
                  style={{ userSelect: 'none' }}>{emoji}</text>
                <text x={px + 9} y={py + 5} textAnchor="middle" fontSize={9}
                  fill="white" fontWeight="bold" style={{ userSelect: 'none' }}>{ratio}</text>
              </g>
            )
          })}

          {/* ── Roads (edges) ── */}
          {edges.map(({ id, x1, y1, x2, y2 }) => {
            const piece = pieces[`e${id}`]
            // Compute polygon hit area in SVG coords (no transform — iOS Safari safe)
            const dx = x2 - x1, dy = y2 - y1
            const len = Math.sqrt(dx*dx + dy*dy)
            const nx = -dy / len * 12, ny = dx / len * 12  // perpendicular, half-width 12px
            const pts = [
              `${(x1+nx).toFixed(1)},${(y1+ny).toFixed(1)}`,
              `${(x1-nx).toFixed(1)},${(y1-ny).toFixed(1)}`,
              `${(x2-nx).toFixed(1)},${(y2-ny).toFixed(1)}`,
              `${(x2+nx).toFixed(1)},${(y2+ny).toFixed(1)}`,
            ].join(' ')
            return (
              <g key={id}
                onClick={() => toggleEdge(id)}
                onTouchEnd={(e) => { e.preventDefault(); toggleEdge(id) }}
                style={{ cursor: selPiece === 'road' ? 'pointer' : 'default', touchAction: 'none' }}>
                {/* Fat polygon hit area — no CSS transform, iOS Safari safe */}
                <polygon points={pts} fill="rgba(0,0,0,0.001)" />
                {/* Hover hint when in road mode & no piece */}
                {!piece && selPiece === 'road' && (
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="rgba(245,158,11,0.25)" strokeWidth={4} strokeLinecap="round"/>
                )}
                {/* Placed road */}
                {piece && (
                  <>
                    <line x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="rgba(0,0,0,0.5)" strokeWidth={8} strokeLinecap="round"/>
                    <line x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={PLAYER_COLORS[piece.color]}
                      strokeWidth={6} strokeLinecap="round"/>
                  </>
                )}
              </g>
            )
          })}

          {/* ── Vertices (settlements/cities) ── */}
          {vertices.map(({ id, x, y }) => {
            const piece = pieces[`v${id}`]
            const isClickable = selPiece !== 'road'
            const col = piece ? PLAYER_COLORS[piece.color] : undefined
            return (
              <g key={id}
                onClick={() => toggleVertex(id)}
                onTouchEnd={(e) => { e.preventDefault(); toggleVertex(id) }}
                style={{ cursor: isClickable ? 'pointer' : 'default', touchAction: 'none' }}>
                {/* Hit area — rgba(0,0,0,0.001) instead of transparent (iOS Safari fix) */}
                <circle cx={x} cy={y} r={14} fill="rgba(0,0,0,0.001)" />

                {/* Hover hint when in build mode & no piece */}
                {!piece && selPiece !== 'road' && (
                  <circle cx={x} cy={y} r={5}
                    fill="rgba(245,158,11,0.3)"
                    stroke="rgba(245,158,11,0.6)" strokeWidth={1}
                  />
                )}

                {piece?.type === 'settlement' && col && (
                  /* House shape: base rect + triangle roof */
                  <g>
                    {/* Shadow */}
                    <rect x={x - 7} y={y - 4} width={14} height={10} rx={1.5}
                      fill="rgba(0,0,0,0.5)"/>
                    {/* Body */}
                    <rect x={x - 7} y={y - 4} width={14} height={10} rx={1.5}
                      fill={col} stroke="white" strokeWidth={1.5}/>
                    {/* Roof */}
                    <polygon points={`${x},${y - 13} ${x - 9},${y - 4} ${x + 9},${y - 4}`}
                      fill={col} stroke="white" strokeWidth={1.5} strokeLinejoin="round"/>
                    {/* Door */}
                    <rect x={x - 2} y={y + 1} width={4} height={5} rx={1}
                      fill="rgba(0,0,0,0.4)"/>
                  </g>
                )}

                {piece?.type === 'city' && col && (
                  /* City: two buildings */
                  <g>
                    {/* Shadow */}
                    <rect x={x - 10} y={y - 10} width={20} height={14} rx={1.5}
                      fill="rgba(0,0,0,0.5)"/>
                    {/* Main building */}
                    <rect x={x - 10} y={y - 10} width={20} height={14} rx={1.5}
                      fill={col} stroke="white" strokeWidth={1.5}/>
                    {/* Tower left */}
                    <rect x={x - 10} y={y - 18} width={8} height={10} rx={1}
                      fill={col} stroke="white" strokeWidth={1.5}/>
                    {/* Tower right */}
                    <rect x={x + 2} y={y - 15} width={8} height={7} rx={1}
                      fill={col} stroke="white" strokeWidth={1.2}/>
                    {/* Merlons left tower */}
                    <rect x={x - 10} y={y - 21} width={3} height={4} rx={0.5}
                      fill={col} stroke="white" strokeWidth={1}/>
                    <rect x={x - 5} y={y - 21} width={3} height={4} rx={0.5}
                      fill={col} stroke="white" strokeWidth={1}/>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>}

      {/* Bottom bar — only shown once colors confirmed */}
      {colorsConfirmed && <div className="bg-stone-800 border-t border-stone-700 px-4 py-3 flex gap-3 shrink-0">
        <button onClick={() => setPieces({})}
          className="flex-1 py-2.5 rounded-xl border border-stone-600 bg-stone-700 text-stone-200 text-sm font-semibold">
          Limpiar
        </button>
        <button
          data-tour="confirm-board-btn"
          onClick={() => allPlayersReady && onConfirm({ pieces, myColor: assignments[0] ?? 'red', assignments, robberHex })}
          disabled={!allPlayersReady}
          title={!allPlayersReady ? `Faltan piezas: cada jugador necesita ${MIN_SETTLEMENTS} poblados y ${MIN_ROADS} caminos` : ''}
          className={`flex-[2] py-2.5 rounded-xl text-sm font-bold transition-colors ${
            allPlayersReady
              ? 'bg-amber-500 hover:bg-amber-400 text-black cursor-pointer'
              : 'bg-stone-700 text-stone-500 cursor-not-allowed border border-stone-600'
          }`}>
          {allPlayersReady
            ? `Confirmar tablero (${pieceCount}) →`
            : `Faltan piezas por colocar`
          }
        </button>
      </div>}
    </div>
  )
}
