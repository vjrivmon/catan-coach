import { NextRequest, NextResponse } from 'next/server'
import { debugLog } from '@/src/lib/debugLog'

/**
 * Standard beginner board — 19 hexes in board order.
 * Matches TERRAIN_ORDER and NUMBERS arrays in BoardOverlay.tsx.
 * probability = dots / 36 (standard 2d6 distribution)
 */
const DOTS: Record<number,number> = {2:1,3:2,4:3,5:4,6:5,8:5,9:4,10:3,11:2,12:1}
const TERRAIN_ORDER = [
  'ore','wool','wood',
  'wheat','brick','wool','brick',
  'brick','wheat','desert','wood','ore',
  'wood','ore','wheat','wool',
  'wheat','wood','wool',
]
const NUMBERS = [10,2,9, 12,6,4,10, 9,11,0,3,8, 8,3,4,5, 5,6,11]

// Axial coordinates for standard Catan board (hex grid)
const HEX_COORDS = [
  // row 0 (3 hexes)
  {q:-2,r:0},{q:-1,r:-1},{q:0,r:-2},
  // row 1 (4 hexes)
  {q:-2,r:1},{q:-1,r:0},{q:0,r:-1},{q:1,r:-2},
  // row 2 (5 hexes — widest)
  {q:-2,r:2},{q:-1,r:1},{q:0,r:0},{q:1,r:-1},{q:2,r:-2},
  // row 3 (4 hexes)
  {q:-1,r:2},{q:0,r:1},{q:1,r:0},{q:2,r:-1},
  // row 4 (3 hexes)
  {q:0,r:2},{q:1,r:1},{q:2,r:0},
]

const STANDARD_HEXES = TERRAIN_ORDER.map((terrain, i) => ({
  q: HEX_COORDS[i].q,
  r: HEX_COORDS[i].r,
  resource: terrain === 'ore' ? 'ore'
    : terrain === 'wool' ? 'sheep'
    : terrain === 'wood' ? 'wood'
    : terrain === 'wheat' ? 'wheat'
    : terrain === 'brick' ? 'brick'
    : 'desert',
  number: NUMBERS[i] > 0 ? NUMBERS[i] : null,
  probability: NUMBERS[i] > 0 ? (DOTS[NUMBERS[i]] ?? 0) / 36 : 0,
}))

const COACH_API_URL = process.env.COACH_API_URL ?? 'http://localhost:8001'

export interface CoachRecommendInput {
  resources: Record<string, number>       // { wood, clay, wool, cereal, mineral }
  settlements: number[]                    // vertex ids
  cities: number[]
  roads: string[]                         // edge ids like "5_6"
  vp: number
  roadLength: number
  devCards?: Record<string, number>
  turn?: number
  numPlayers?: number
  gamePhasePlaying?: boolean
  robberHex?: number                       // hex index 0-18, 9=desert default
}

export async function POST(req: NextRequest) {
  try {
    const body: CoachRecommendInput = await req.json()

    debugLog.coachRequest({ resources: body.resources, settlements: body.settlements, roads: body.roads, vp: body.vp ?? 2, turn: body.turn })

    // Translate frontend resource keys → API keys (brick=clay, sheep=wool, wheat=cereal)
    const resources = {
      wood:  body.resources.wood    ?? 0,
      brick: body.resources.clay    ?? 0,   // frontend uses "clay", API uses "brick"
      sheep: body.resources.wool    ?? 0,   // frontend uses "wool", API uses "sheep"
      wheat: body.resources.cereal  ?? 0,   // frontend uses "cereal", API uses "wheat"
      ore:   body.resources.mineral ?? 0,   // frontend uses "mineral", API uses "ore"
    }

    // Translate edge ids "lo_hi" → [lo, hi] tuples
    const roads = (body.roads ?? [] as string[]).map(id => {
      const parts = id.replace(/^e/, '').split('_').map(Number)
      return parts.length === 2 ? parts : [0, 1]
    })

    const payload = {
      board_state: {
        hexes: STANDARD_HEXES,
        vertices: [],
        ports: [],
        robber_hex: body.robberHex ?? 9,
      },
      player: {
        color: 'red',
        resources,
        settlements: Array.isArray(body.settlements) ? body.settlements : [],
        cities:      Array.isArray(body.cities)      ? body.cities      : [],
        roads,
        dev_cards: {
          knight:         body.devCards?.knight        ?? 0,
          vp:             body.devCards?.vp            ?? 0,
          monopoly:       body.devCards?.monopoly      ?? 0,
          road_building:  body.devCards?.road_building ?? 0,
          year_of_plenty: body.devCards?.year_of_plenty ?? 0,
        },
        vp:          body.vp ?? 2,
        road_length: body.roadLength ?? 0,
      },
      game_phase: body.gamePhasePlaying ? 'playing' : 'playing',
      turn:        body.turn ?? 1,
      num_players: body.numPlayers ?? 4,
    }

    const apiRes = await fetch(`${COACH_API_URL}/coach/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    })

    if (!apiRes.ok) {
      const err = await apiRes.text()
      return NextResponse.json({ error: `GeneticAgent error: ${apiRes.status} — ${err}` }, { status: 502 })
    }

    const data = await apiRes.json()

    // Translate action names back to Spanish for the LLM context
    const ACTION_ES: Record<string, string> = {
      build_road:       'Construir camino',
      build_settlement: 'Construir poblado',
      build_city:       'Construir ciudad',
      buy_dev_card:     'Comprar carta de desarrollo',
      pass:             'Pasar turno',
    }

    debugLog.coachResponse({ action: data.action, score: data.score, reason: data.reason?.slice(0,100) })

    return NextResponse.json({
      action:      data.action,
      actionEs:    ACTION_ES[data.action] ?? data.action,
      score:       data.score,
      reason:      data.reason,
      alternatives: (data.alternatives ?? []).map((a: any) => ({
        action:   a.action,
        actionEs: ACTION_ES[a.action] ?? a.action,
        score:    a.score,
        reason:   a.reason,
      })),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
