'use client'

import { useState, useMemo, useCallback, useRef } from 'react'

// ─── Geometry ──────────────────────────────────────────────────────────────────
const R = 40          // hex radius (center → vertex)
const W = Math.sqrt(3) * R   // hex width  ≈ 69.28
const ROW_H = 1.5 * R        // vertical dist between row centers = 60

// SVG canvas
const SVG_W = 390
const PAD_TOP = 78    // space for port badges at top + offset

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

  return {
    vertices: [...vertMap.values()],
    edges:    [...edgeMap.values()],
  }
}

// ─── Ports (standard beginner board, clockwise from top-left) ─────────────────
// Each port: position in SVG coords (center of the port badge) + type
const TERRAIN_COLOR: Record<string, string> = {
  wood:    '#166534', clay: '#b45309', cereal: '#92400e',
  wool:    '#4d7c0f', mineral: '#64748b', desert: '#d97706',
}
type PortType = 'mineral'|'clay'|'cereal'|'wool'|'wood'|'3:1'
interface Port { type: PortType; x: number; y: number; label: string }

const PORTS: Port[] = [
  // Top (above row 0)
  { type: 'mineral', x: 108,  y: 26,  label: '⛏ 2:1' },
  { type: '3:1',     x: 195,  y: 18,  label: '⚖ 3:1' },
  { type: 'wood',    x: 282,  y: 26,  label: '🪵 2:1' },
  // Right side
  { type: '3:1',     x: 374,  y: 110, label: '⚖ 3:1' },
  { type: 'cereal',  x: 374,  y: 198, label: '🌾 2:1' },
  { type: '3:1',     x: 355,  y: 285, label: '⚖ 3:1' },
  // Bottom (below row 4)
  { type: 'clay',    x: 264,  y: 362, label: '🧱 2:1' },
  { type: '3:1',     x: 126,  y: 362, label: '⚖ 3:1' },
  // Left side
  { type: 'wool',    x: 16,   y: 198, label: '🐑 2:1' },
]

// ─── Colors ───────────────────────────────────────────────────────────────────
const PLAYER_COLORS: Record<string, string> = {
  red: '#ef4444', blue: '#3b82f6', orange: '#f97316', white: '#e5e7eb',
}

type Piece = { type: 'settlement' | 'city' | 'road'; color: string }

// ─── Component ────────────────────────────────────────────────────────────────
interface BoardOverlayProps {
  onClose:   () => void
  onConfirm: (pieces: Record<string, Piece>) => void
}

export function BoardOverlay({ onClose, onConfirm }: BoardOverlayProps) {
  const [selColor, setSelColor] = useState('red')
  const [selPiece, setSelPiece] = useState<'settlement' | 'city' | 'road'>('settlement')
  const [pieces, setPieces]     = useState<Record<string, Piece>>({})

  const { vertices, edges } = useMemo(buildGraph, [])

  // lastTap prevents double-fire from pointerdown+click on mobile
  const lastTap = useRef(0)

  const toggleVertex = useCallback((id: number) => {
    if (selPiece === 'road') return
    const now = Date.now()
    if (now - lastTap.current < 300) return
    lastTap.current = now
    const k = `v${id}`
    setPieces(p => {
      const n = { ...p }
      if (n[k]?.color === selColor && n[k]?.type === selPiece) delete n[k]
      else n[k] = { type: selPiece, color: selColor }
      return n
    })
  }, [selPiece, selColor])

  const toggleEdge = useCallback((id: string) => {
    if (selPiece !== 'road') return
    const now = Date.now()
    if (now - lastTap.current < 300) return
    lastTap.current = now
    const k = `e${id}`
    setPieces(p => {
      const n = { ...p }
      if (n[k]?.color === selColor) delete n[k]
      else n[k] = { type: 'road', color: selColor }
      return n
    })
  }, [selPiece, selColor])

  const pieceCount = Object.keys(pieces).length
  const svgH = PAD_TOP + 4 * ROW_H + R + 30  // ≈ 355

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-stone-900">

      {/* Header */}
      <div className="bg-stone-800 border-b border-stone-700 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:bg-stone-700">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
        <div className="flex-1">
          <p className="text-stone-100 font-semibold text-sm">Tablero interactivo</p>
          <p className="text-stone-400 text-xs">Vértice → pueblo/ciudad · Arista → camino</p>
        </div>
      </div>

      {/* Player selector */}
      <div className="bg-stone-800 border-b border-stone-700 px-3 py-2 flex items-center gap-2 shrink-0 overflow-x-auto">
        <span className="text-stone-500 text-xs shrink-0">Jugador:</span>
        {(['red','blue','orange','white'] as const).map((c, i) => (
          <button key={c} onClick={() => setSelColor(c)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold shrink-0 transition-all ${
              selColor === c ? 'bg-current/10' : 'border-stone-600 text-stone-400'
            }`}
            style={selColor === c ? { color: PLAYER_COLORS[c], borderColor: PLAYER_COLORS[c] } : {}}>
            <div className="w-2 h-2 rounded-full" style={{ background: PLAYER_COLORS[c] }} />
            {['Tú','J2','J3','J4'][i]}
          </button>
        ))}
      </div>

      {/* Piece selector */}
      <div className="bg-stone-800 border-b border-stone-700 px-3 py-2 flex gap-2 shrink-0">
        {(['settlement','city','road'] as const).map(p => (
          <button key={p} onClick={() => setSelPiece(p)}
            className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
              selPiece === p
                ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                : 'border-stone-600 text-stone-400 bg-stone-700'
            }`}>
            {p === 'settlement' ? 'Pueblo' : p === 'city' ? 'Ciudad' : 'Camino'}
          </button>
        ))}
      </div>

      {/* SVG Board */}
      <div className="flex-1 overflow-auto" style={{ background: '#1a2f5a' }}>
        <svg
          width="100%"
          viewBox={`0 0 ${SVG_W} ${svgH}`}
          style={{ display: 'block', maxWidth: '100%' }}
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

          {/* Background */}
          <rect width={SVG_W} height={svgH} fill="url(#bgGrad)" />

          {/* ── Hexes ── */}
          {HEX_CENTERS.map(([cx, cy], i) => {
            const terrain = TERRAIN_ORDER[i] as TerrainType
            const num     = NUMBERS[i]
            const verts   = hexVertices(cx, cy)
            const pts     = polyPoints(verts)
            const imgUrl  = TEXTURE[terrain]

            return (
              <g key={i}>
                {/* Texture fill via image + clipPath */}
                <image
                  href={imgUrl}
                  x={cx - W / 2} y={cy - R}
                  width={W} height={2 * R}
                  clipPath={`url(#hclip${i})`}
                  preserveAspectRatio="xMidYMid slice"
                />
                {/* Hex border */}
                <polygon points={pts} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth={1} />

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
                {/* Desert banner */}
                {terrain === 'desert' && (
                  <text x={cx} y={cy + 4} textAnchor="middle" fontSize={18}>🏴</text>
                )}
              </g>
            )
          })}

          {/* ── Ports ── */}
          {PORTS.map((port, i) => {
            const isGeneric = port.type === '3:1'
            const emoji = port.type === 'mineral' ? '⛏' : port.type === 'clay' ? '🧱' :
                          port.type === 'cereal'  ? '🌾' : port.type === 'wool' ? '🐑' :
                          port.type === 'wood'    ? '🪵' : '🔄'
            const ratio = isGeneric ? '3:1' : '2:1'
            // Small pill: semi-transparent dark background, emoji + ratio
            const pw = 34, ph = 18
            return (
              <g key={i}>
                <rect x={port.x - pw/2} y={port.y - ph/2} width={pw} height={ph} rx={5}
                  fill="rgba(15,23,42,0.82)" stroke="rgba(255,255,255,0.3)" strokeWidth={1}/>
                <text x={port.x - 6} y={port.y + 5} textAnchor="middle" fontSize={10}
                  style={{ userSelect: 'none' }}>{emoji}</text>
                <text x={port.x + 10} y={port.y + 5} textAnchor="middle" fontSize={9}
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
                style={{ cursor: selPiece === 'road' ? 'pointer' : 'default' }}>
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
                style={{ cursor: isClickable ? 'pointer' : 'default' }}>
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
      </div>

      {/* Bottom bar */}
      <div className="bg-stone-800 border-t border-stone-700 px-4 py-3 flex gap-3 shrink-0">
        <button onClick={() => setPieces({})}
          className="flex-1 py-2.5 rounded-xl border border-stone-600 bg-stone-700 text-stone-200 text-sm font-semibold">
          Limpiar
        </button>
        <button onClick={() => onConfirm(pieces)}
          className="flex-[2] py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-colors">
          Confirmar tablero{pieceCount > 0 ? ` (${pieceCount})` : ''} →
        </button>
      </div>
    </div>
  )
}
