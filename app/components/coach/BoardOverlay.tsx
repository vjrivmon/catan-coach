'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  R, W, ROW_H, SVG_W, PAD_TOP, ROWS, X0, ANGLES,
  HEX_CENTERS, TERRAIN_ORDER, NUMBERS,
  hexVertices, polyPoints, approxKey,
  type TerrainType,
} from '@/src/lib/boardGeometry'

const TEXTURE: Record<TerrainType, string> = {
  clay:    '/board-textures/quarry.jpg',
  mineral: '/board-textures/mountain.jpg',
  wood:    '/board-textures/forest.jpg',
  cereal:  '/board-textures/cereal.jpg',
  wool:    '/board-textures/wool.jpg',
  desert:  '/board-textures/desert.jpg',
}

// ─── Vertex / Edge types (local — geometry imported from boardGeometry) ────────
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

const PORT_LABEL: Record<PortType, string> = {
  mineral: '⛰️', clay: '🧱', cereal: '🌾', wool: '🐑', wood: '🌲', '3:1': '3:1',
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
const MAX_ROADS       = 2
// Catán colocación inicial: 2 rondas de (1 poblado + 1 camino) = 2 poblados + 2 caminos por jugador.
// Alternancia estricta S→R→S→R enforzada en toggleEdge + useEffect.
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
  ports:       string[]   // PortType[] the player has access to
}

export interface BoardRecommendationPreview {
  type:     'road' | 'settlement' | 'city'
  position: string   // "v54" o "e12_34"
  label:    string
}

interface BoardOverlayProps {
  onClose:            () => void
  onConfirm:          (payload: BoardConfirmPayload) => void
  initialPieces?:     Record<string, Piece>
  initialMyColor?:    string
  initialAssignments?: string[]
  initialRobberHex?:  number
  initialPorts?:      string[]  // PortType[] restored from session
  startInRobberMode?: boolean   // auto-activate movingRobber on mount (triggered by dice=7)
  gameStarted?:       boolean   // oculta ladrón y ciudad en colocación inicial
  // Fase 3 — modo highlight: muestra aura pulsante sobre la posición recomendada
  previewRecommendation?: BoardRecommendationPreview
  onConfirmRecommendation?: () => void
}

export function BoardOverlay({ onClose, onConfirm, initialPieces = {}, initialMyColor, initialAssignments, initialRobberHex = 9, initialPorts = [], startInRobberMode = false, gameStarted = false, previewRecommendation, onConfirmRecommendation }: BoardOverlayProps) {
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
  const [movingRobber, setMovingRobber] = useState(startInRobberMode)
  // Fase C — puertos del jugador
  const [myPorts, setMyPorts] = useState<string[]>(initialPorts)

  const { vertices, edges, adjacency } = useMemo(buildGraph, [])

  // lastTap prevents double-fire from pointerdown+click on mobile
  const lastTap = useRef(0)

  const showWarning = useCallback((msg: string) => {
    setWarning(msg)
    setTimeout(() => setWarning(null), 2500)
  }, [])

  // Auto-switch lógico al colocar piezas (alternancia estricta S→R→S→R):
  // 1. Tras colocar un poblado → forzar 'road' (siguiente acción obligada).
  // 2. Tras colocar el camino asociado → forzar 'settlement' si quedan poblados.
  // 3. Si el jugador está completo (2 poblados + 2 caminos) → pasar al siguiente incompleto.
  useEffect(() => {
    if (!colorsConfirmed) return
    const { settlements, roads } = countByPlayer(pieces, selColor)
    const isComplete = settlements >= MAX_SETTLEMENTS && roads >= MAX_ROADS

    if (isComplete) {
      const nextIncomplete = assignments.find(color => {
        const { settlements: s, roads: r } = countByPlayer(pieces, color)
        return s < MAX_SETTLEMENTS || r < MAX_ROADS
      })
      if (nextIncomplete) {
        setSelColor(nextIncomplete)
        const { settlements: ns, roads: nr } = countByPlayer(pieces, nextIncomplete)
        // Si arranca con poblado pendiente de su camino (ns > nr) → road; si no → settlement.
        setSelPiece(nr < ns ? 'road' : 'settlement')
      }
    } else if (selPiece === 'settlement' && settlements > roads) {
      // Acaba de colocar un poblado → siguiente acción obligada: camino
      setSelPiece('road')
    } else if (selPiece === 'road' && roads >= settlements && settlements < MAX_SETTLEMENTS) {
      // Acaba de colocar el camino asociado → siguiente acción obligada: poblado
      setSelPiece('settlement')
    }
  }, [pieces, selColor, selPiece, assignments, colorsConfirmed])

  const toggleVertex = useCallback((id: number) => {
    if (selPiece === 'road') return
    const now = Date.now()
    if (now - lastTap.current < 300) return
    lastTap.current = now
    const k = `v${id}`

    setPieces(p => {
      // Removing an existing own piece — always allowed
      if (p[k]?.color === selColor && (p[k]?.type === selPiece || (selPiece === 'settlement' && p[k]?.type === 'city'))) {
        const n = { ...p }
        delete n[k]
        return n
      }

      // Placing a new settlement — run rules
      const { settlements } = countByPlayer(p, selColor)

      // Rule 1: max 2 settlements per player in initial phase (skip in game)
      if (!gameStarted && !p[k] && settlements >= MAX_SETTLEMENTS) {
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

      // Reglas Catán colocación inicial (skip en partida en curso):
      // 1. roads ≤ settlements: cada camino debe ir tras su poblado correspondiente.
      // 2. roads ≤ MAX_ROADS: tope global de 2 caminos por jugador (2 rondas de 1+1).
      const { settlements, roads } = countByPlayer(p, selColor)
      if (!gameStarted && roads >= settlements) {
        showWarning('Primero coloca el poblado; después su camino')
        return p
      }
      if (!gameStarted && roads >= MAX_ROADS) {
        showWarning(`Máximo ${MAX_ROADS} caminos por jugador en la colocación inicial`)
        return p
      }

      // Rule: edge already occupied
      if (p[k] && p[k].color !== selColor) {
        showWarning('Esta arista ya está ocupada por otro jugador')
        return p
      }

      // Rule: connectivity — road must touch own settlement OR own road
      const [vA, vB] = id.split('_').map(Number)
      const vertexHasOwnPiece = (vid: number) =>
        p[`v${vid}`]?.color === selColor &&
        (p[`v${vid}`]?.type === 'settlement' || p[`v${vid}`]?.type === 'city')
      const vertexHasOwnRoad = (vid: number) => {
        const neighbors = adjacency.get(vid) ?? new Set<number>()
        for (const nid of neighbors) {
          const lo = Math.min(vid, nid), hi = Math.max(vid, nid)
          const eid = `e${lo}_${hi}`
          if (p[eid]?.color === selColor) return true
        }
        return false
      }
      const connected =
        vertexHasOwnPiece(vA) || vertexHasOwnPiece(vB) ||
        vertexHasOwnRoad(vA)  || vertexHasOwnRoad(vB)

      if (!connected) {
        showWarning('El camino debe conectar con un poblado o camino propio')
        return p
      }

      const n = { ...p }
      n[k] = { type: 'road', color: selColor }
      return n
    })
  }, [selPiece, selColor, showWarning, adjacency])

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

      {/* Botón X para cerrar — solo visible cuando la partida ya ha iniciado y NO hay preview */}
      {gameStarted && !previewRecommendation && (
        <div className="flex items-center justify-end bg-stone-900/60 border-b border-stone-700 px-3 py-1.5 shrink-0">
          <button
            onClick={onClose}
            aria-label="Cerrar tablero"
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-stone-700 hover:bg-stone-600 text-stone-300 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Color assignment (sequential) or Player selector */}
      {!colorsConfirmed ? (
        /* Step-by-step color assignment */
        <div data-tour="color-picker" className="bg-stone-800 border-b border-stone-700 px-4 py-3 shrink-0">
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
                    onClick={() => { setAssignments([...assignments, j4Color]); setColorsConfirmed(true); setSelPiece('settlement') }}
                    className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-full border border-stone-600 text-sm font-bold text-stone-300 hover:border-stone-400 transition-colors">
                    <div className="w-4 h-4 rounded-full" style={{ background: PLAYER_COLORS[j4Color] }} />
                    Sí (somos 4)
                  </button>
                  <button
                    onClick={() => { setColorsConfirmed(true); setSelPiece('settlement') }}
                    className="px-4 py-2.5 min-h-[44px] rounded-full border border-stone-600 text-sm text-stone-500 hover:text-stone-300 transition-colors">
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
                        className="w-12 h-12 min-w-[44px] min-h-[44px] rounded-full border-2 border-stone-600 hover:border-white hover:scale-110 active:scale-90 active:ring-2 active:ring-white active:ring-offset-2 active:ring-offset-stone-800 transition-all"
                        style={{ background: PLAYER_COLORS[c] }}
                      />
                    ))}
                  </div>
                </div>
                {/* Escape only at J2 step — at J3 step, must pick color first */}
                {step === 1 && (
                  <button onClick={() => { setColorsConfirmed(true); setSelPiece('settlement') }}
                    className="self-start min-h-[44px] px-4 py-3 text-sm text-amber-400 hover:text-amber-300 transition-colors underline underline-offset-2">
                    No hay J3 ni J4 (somos 2)
                  </button>
                )}
              </div>
            )
          })()}
        </div>
      ) : (
        /* Player selector once colors assigned */
        <div data-tour="colors-done" className="bg-stone-800 border-b border-stone-700 px-3 py-2 flex items-center gap-2 shrink-0 overflow-x-auto">
          <span className="text-stone-500 text-xs shrink-0">Jugador:</span>
          {assignments.map((c, i) => (
            <button key={c} onClick={() => { setSelColor(c); setSelPiece('settlement') }}
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

      {/* Setup guide — shown during color assignment */}
      {!colorsConfirmed && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6" style={{ background: '#0f1f40' }}>
          {/* Progress dots */}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <div className="w-8 h-0.5 bg-stone-600" />
            <div className="w-3 h-3 rounded-full border-2 border-stone-600" />
            <div className="w-8 h-0.5 bg-stone-600" />
            <div className="w-3 h-3 rounded-full border-2 border-stone-600" />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold text-amber-400">Elige los colores</h2>
            <p className="text-stone-400 text-sm max-w-xs">
              Asigna un color a cada jugador. Después colocarás pueblos y caminos en el tablero.
            </p>
          </div>
          {/* Already assigned colors preview */}
          {assignments.length > 0 && (
            <div className="flex gap-3 items-center">
              {assignments.map((c, i) => (
                <div key={c} className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full ring-2 ring-white ring-offset-2 ring-offset-[#0f1f40]" style={{ background: PLAYER_COLORS[c] }} />
                  <span className="text-xs text-stone-400">{i === 0 ? 'Tú' : `J${i + 1}`}</span>
                </div>
              ))}
            </div>
          )}
          {/* Steps preview */}
          <div className="flex flex-col gap-1 text-xs text-stone-500">
            <span>{assignments.length > 0 ? '✓' : '→'} Colores de jugadores</span>
            <span>→ Colocar piezas en el tablero</span>
            <span>→ Recibir recomendaciones</span>
          </div>
        </div>
      )}

      {/* Piece selector + per-player status — only shown once colors confirmed */}
      {colorsConfirmed && (
        <div className="bg-stone-800 border-b border-stone-700 px-3 py-2 flex flex-col gap-2 shrink-0">
          {/* Piece type buttons */}
          <div className="flex gap-2 items-center flex-wrap">
            {(['settlement','road','city'] as const).map(p => {
              const { settlements, roads } = countByPlayer(pieces, selColor)
              // En colocación inicial, limitar por MAX; en partida en curso, siempre habilitado
              const isDisabled = gameStarted ? false : (
                p === 'settlement' ? settlements >= MAX_SETTLEMENTS :
                p === 'road'       ? roads >= MAX_ROADS :
                true  // city siempre deshabilitada en fase inicial
              )
              if (p === 'city' && !gameStarted) return null  // ocultar ciudad en fase inicial
              return (
                <button key={p}
                  onClick={() => { if (!isDisabled) { setSelPiece(p as 'settlement' | 'road'); setMovingRobber(false) } }}
                  disabled={isDisabled}
                  className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                    isDisabled
                      ? 'border-stone-700 text-stone-600 bg-stone-800 cursor-not-allowed opacity-50'
                      : selPiece === p && !movingRobber
                        ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                        : 'border-stone-600 text-stone-400 bg-stone-700'
                  }`}>
                  {p === 'settlement'
                    ? (gameStarted ? 'Poblado' : `Pueblo ${settlements}/${MAX_SETTLEMENTS}`)
                    : p === 'road'
                    ? (gameStarted ? 'Camino' : `Camino ${roads}/${MAX_ROADS}`)
                    : 'Ciudad'}
                </button>
              )
            })}
            {/* Mover ladrón — solo visible si la partida ya está en curso */}
            {gameStarted && (
              <>
                <button
                  onClick={() => setMovingRobber(r => !r)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                    movingRobber
                      ? 'border-red-500 text-red-400 bg-red-500/10'
                      : 'border-amber-700/60 text-amber-400/80 bg-amber-900/20 hover:border-amber-600 hover:text-amber-300'
                  }`}>
                  {movingRobber ? '✕ Cancelar' : '🦹 Mover ladrón'}
                </button>
                {movingRobber && (
                  <span className="text-red-400 text-xs">Toca un hex para mover el ladrón</span>
                )}
              </>
            )}
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

          {/* ── Ports — Fase C ── */}
          {(gameStarted || colorsConfirmed) && PORT_DEFS.map((def, i) => {
            const { vx1, vy1, vx2, vy2, px, py } = portGeom(def)
            const isGeneric = def.type === '3:1'
            const ratio = isGeneric ? '3:1' : '2:1'
            const label = PORT_LABEL[def.type]
            const mx = (vx1 + vx2) / 2, my = (vy1 + vy2) / 2
            const pw = 38, ph = 20
            const owned = myPorts.includes(def.type)
            const togglePort = () => {
              setMyPorts(prev =>
                prev.includes(def.type)
                  ? prev.filter(p => p !== def.type)
                  : [...prev, def.type]
              )
            }
            return (
              <g key={i} onClick={togglePort} style={{ cursor: 'pointer' }}>
                {/* Connector line: pill → edge midpoint */}
                <line x1={px} y1={py} x2={mx} y2={my}
                  stroke={owned ? 'rgba(251,191,36,0.85)' : 'rgba(251,191,36,0.45)'}
                  strokeWidth={owned ? 2 : 1.5} strokeDasharray="3 2"/>
                {/* Vertex access dots */}
                <circle cx={vx1} cy={vy1} r={owned ? 5 : 4}
                  fill={owned ? '#fbbf24' : '#fbbf24'} opacity={owned ? 1 : 0.6}/>
                <circle cx={vx2} cy={vy2} r={owned ? 5 : 4}
                  fill={owned ? '#fbbf24' : '#fbbf24'} opacity={owned ? 1 : 0.6}/>
                {/* Port pill — golden border if owned */}
                <rect x={px - pw/2} y={py - ph/2} width={pw} height={ph} rx={5}
                  fill={owned ? 'rgba(120,80,0,0.92)' : 'rgba(15,23,42,0.88)'}
                  stroke={owned ? '#fbbf24' : 'rgba(251,191,36,0.5)'}
                  strokeWidth={owned ? 2 : 1}/>
                {/* Label emoji + ratio */}
                <text x={px - pw/2 + 11} y={py + 4} textAnchor="middle" fontSize={11}
                  style={{ userSelect: 'none' }}>{label}</text>
                <text x={px + pw/2 - 10} y={py + 4} textAnchor="middle" fontSize={8}
                  fill={owned ? '#fbbf24' : '#a8a29e'}
                  style={{ userSelect: 'none' }}>{ratio}</text>
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
                data-edge-id={id}
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
                data-vertex-id={id}
                onClick={() => toggleVertex(id)}
                onTouchEnd={(e) => { e.preventDefault(); toggleVertex(id) }}
                style={{ cursor: isClickable ? 'pointer' : 'default', touchAction: 'none' }}>
                {/* Hit area — rgba(0,0,0,0.001) instead of transparent (iOS Safari fix). r=20 ≈ 40px tap target (mobile-first). */}
                <circle cx={x} cy={y} r={20} fill="rgba(0,0,0,0.001)" />

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
          {/* ── Fase 3: aura pulsante sobre la posición recomendada ── */}
          {previewRecommendation && (() => {
            const rec = previewRecommendation
            const isVertex = rec.position.startsWith('v')
            const isEdge   = rec.position.startsWith('e') || rec.position.includes('_')

            if (isVertex) {
              const vid = parseInt(rec.position.replace(/^v/, ''))
              const vert = vertices.find(v => v.id === vid)
              if (!vert) return null
              return (
                <g key="rec-highlight">
                  {/* Outer pulse ring */}
                  <circle cx={vert.x} cy={vert.y} r={22}
                    fill="none" stroke="#f59e0b" strokeWidth={3} opacity={0.6}
                    style={{ animation: 'recPulse 1.4s ease-in-out infinite' }}
                  />
                  {/* Inner glow */}
                  <circle cx={vert.x} cy={vert.y} r={14}
                    fill="#f59e0b" opacity={0.25}
                    style={{ animation: 'recPulse 1.4s ease-in-out infinite 0.2s' }}
                  />
                  {/* Center dot */}
                  <circle cx={vert.x} cy={vert.y} r={6}
                    fill="#fbbf24" stroke="white" strokeWidth={1.5}
                  />
                </g>
              )
            }

            if (isEdge) {
              const edgeId = rec.position.replace(/^e/, '')
              const edge = edges.find(e => e.id === edgeId)
              if (!edge) return null
              const mx = (edge.x1 + edge.x2) / 2
              const my = (edge.y1 + edge.y2) / 2
              const dx = edge.x2 - edge.x1, dy = edge.y2 - edge.y1
              const len = Math.sqrt(dx*dx + dy*dy) || 1
              return (
                <g key="rec-highlight">
                  {/* Glow line */}
                  <line x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                    stroke="#f59e0b" strokeWidth={10} strokeLinecap="round" opacity={0.35}
                    style={{ animation: 'recPulse 1.4s ease-in-out infinite' }}
                  />
                  <line x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                    stroke="#fbbf24" strokeWidth={5} strokeLinecap="round" opacity={0.85}
                  />
                  {/* Center indicator */}
                  <circle cx={mx} cy={my} r={6}
                    fill="#fbbf24" stroke="white" strokeWidth={1.5}
                  />
                  {/* Direction arrow along the edge */}
                  <line x1={mx} y1={my}
                    x2={mx + (dx/len)*10} y2={my + (dy/len)*10}
                    stroke="white" strokeWidth={2} strokeLinecap="round"
                  />
                </g>
              )
            }
            return null
          })()}
        </svg>

        {/* CSS animation keyframes injected inline */}
        <style>{`
          @keyframes recPulse {
            0%, 100% { opacity: 0.6; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.12); }
          }
        `}</style>
      </div>}

      {/* Fase 3 — bottom bar en modo preview */}
      {previewRecommendation && (
        <div className="bg-stone-800 border-t border-amber-700/50 px-4 py-3 flex gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-amber-300 text-sm font-semibold">
              {previewRecommendation.type === 'road' ? 'Camino recomendado' :
               previewRecommendation.type === 'settlement' ? 'Poblado recomendado' : 'Ciudad recomendada'}
            </p>
            <p className="text-stone-400 text-xs mt-0.5 truncate">{previewRecommendation.label}</p>
          </div>
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl border border-stone-600 bg-stone-700 text-stone-200 text-sm font-semibold shrink-0">
            Cerrar
          </button>
          {onConfirmRecommendation && (
            <button
              onClick={() => { onConfirmRecommendation(); onClose() }}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold shrink-0 transition-colors">
              Confirmar jugada →
            </button>
          )}
        </div>
      )}

      {/* Bottom bar normal — only shown once colors confirmed and NOT in preview mode */}
      {colorsConfirmed && !previewRecommendation && <div className="bg-stone-800 border-t border-stone-700 px-4 py-3 flex gap-3 shrink-0">
        <button onClick={() => setPieces({})}
          className="flex-1 py-2.5 rounded-xl border border-stone-600 bg-stone-700 text-stone-200 text-sm font-semibold">
          Limpiar
        </button>
        <button
          data-tour="confirm-board-btn"
          onClick={() => allPlayersReady && onConfirm({ pieces, myColor: assignments[0] ?? 'red', assignments, robberHex, ports: myPorts })}
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
