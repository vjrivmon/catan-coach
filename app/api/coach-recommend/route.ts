import { NextRequest, NextResponse } from 'next/server'
import { debugLog } from '@/src/lib/debugLog'
import {
  STANDARD_HEXES_PAYLOAD,
  buildVerticesPayload,
  describeVertex,
  describeEdge,
  VERT_TO_HEXES,
} from '@/src/lib/boardGeometry'

const COACH_API_URL = process.env.COACH_API_URL ?? 'http://localhost:8001'

export interface OtherPlayerInput {
  color: string
  vp: number
  settlements: number[]
  cities: number[]
  roads: string[]
  knights_played?: number
}

export interface CoachRecommendInput {
  resources: Record<string, number>   // { wood, clay, wool, cereal, mineral }
  settlements: number[]               // vertex ids
  cities: number[]
  roads: string[]                     // edge ids like "5_6"
  vp: number
  roadLength: number
  knightsPlayed?: number
  longestRoad?: boolean
  largestArmy?: boolean
  otherPlayers?: OtherPlayerInput[]
  devCards?: Record<string, number>
  turn?: number
  numPlayers?: number
  gamePhasePlaying?: boolean
  robberHex?: number                  // hex index 0-18, 9=desert default
  ports?: string[]                    // PortType[] the player has access to
}

function translateRoads(roads: string[]) {
  return roads.map(id => {
    const parts = id.replace(/^e/, '').split('_').map(Number)
    return parts.length === 2 ? parts : [0, 1]
  })
}

export async function POST(req: NextRequest) {
  try {
    const body: CoachRecommendInput = await req.json()

    debugLog.coachRequest({ resources: body.resources, settlements: body.settlements, roads: body.roads, vp: body.vp ?? 2, turn: body.turn })

    // Frontend keys → API keys (brick=clay, sheep=wool, wheat=cereal)
    const resources = {
      wood:  body.resources.wood    ?? 0,
      brick: body.resources.clay    ?? 0,
      sheep: body.resources.wool    ?? 0,
      wheat: body.resources.cereal  ?? 0,
      ore:   body.resources.mineral ?? 0,
    }

    const roads       = translateRoads(body.roads ?? [])
    const settlements = Array.isArray(body.settlements) ? body.settlements : []
    const cities      = Array.isArray(body.cities)      ? body.cities      : []

    const otherPlayers = (body.otherPlayers ?? []).map(op => ({
      color:         op.color,
      vp:            op.vp ?? 0,
      settlements:   Array.isArray(op.settlements) ? op.settlements : [],
      cities:        Array.isArray(op.cities)      ? op.cities      : [],
      roads:         translateRoads(op.roads ?? []),
      knights_played: op.knights_played ?? 0,
    }))

    // Vertex topology — lets Python's _get_adjacent_hexes() work with real data
    const allVertexIds = [
      ...settlements, ...cities,
      ...(body.otherPlayers ?? []).flatMap(op => [
        ...(Array.isArray(op.settlements) ? op.settlements : []),
        ...(Array.isArray(op.cities)      ? op.cities      : []),
      ]),
    ]

    // Build ports payload from player's owned ports
    const PORT_VERTEX_IDS_MAP: Record<string, [number, number][]> = {
      mineral: [], clay: [], cereal: [], wool: [], wood: [], '3:1': [],
    }
    // Import PORT_DEFS + PORT_VERTEX_IDS from boardGeometry
    const { PORT_DEFS: portDefs, PORT_VERTEX_IDS: portVids } = await import('@/src/lib/boardGeometry')
    const portsPayload = (body.ports ?? []).flatMap(portType => {
      return portDefs
        .map((def, i) => ({ def, vid: portVids[i] }))
        .filter(({ def }) => def.type === portType)
        .map(({ def, vid }) => ({
          port_type: def.type === '3:1' ? '3:1'
            : def.type === 'mineral' ? 'ore'
            : def.type === 'wool' ? 'sheep'
            : def.type === 'cereal' ? 'wheat'
            : def.type,   // wood, clay keep as-is
          vertices: vid,
        }))
    })

    const payload = {
      board_state: {
        hexes:      STANDARD_HEXES_PAYLOAD,
        vertices:   buildVerticesPayload(allVertexIds),
        ports:      portsPayload,
        robber_hex: body.robberHex ?? 9,
      },
      player: {
        color:          'red',
        resources,
        settlements,
        cities,
        roads,
        dev_cards: {
          knight:         body.devCards?.knight         ?? 0,
          vp:             body.devCards?.vp             ?? 0,
          monopoly:       body.devCards?.monopoly       ?? 0,
          road_building:  body.devCards?.road_building  ?? 0,
          year_of_plenty: body.devCards?.year_of_plenty ?? 0,
        },
        vp:             body.vp            ?? 2,
        road_length:    body.roadLength    ?? 0,
        knights_played: body.knightsPlayed ?? 0,
        longest_road:   body.longestRoad   ?? false,
        largest_army:   body.largestArmy   ?? false,
      },
      other_players: otherPlayers,
      game_phase:  'playing',
      turn:        body.turn       ?? 1,
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

    const ACTION_ES: Record<string, string> = {
      build_road:       'Construir camino',
      build_settlement: 'Construir poblado',
      build_city:       'Construir ciudad',
      buy_dev_card:     'Comprar carta de desarrollo',
      pass:             'Pasar turno',
    }

    debugLog.coachResponse({ action: data.action, score: data.score, reason: data.reason?.slice(0, 100) })

    // Posición concreta para que el LLM dé recomendaciones de "hacia dónde"
    const myRoads = Array.isArray(body.roads) ? body.roads : []
    const myVerts = new Set([...settlements, ...cities])
    const roadVerts = new Set<number>()
    myRoads.forEach(id => id.replace(/^e/, '').split('_').map(Number).forEach(v => roadVerts.add(v)))

    const positionContext = {
      mySettlements: settlements.map(vid => `v${vid}: ${describeVertex(vid)}`),
      myRoads:       myRoads.map(eid => `${eid}: ${describeEdge(eid)}`),
      frontier:      [...roadVerts]
        .filter(v => !myVerts.has(v))
        .slice(0, 5)
        .map(vid => `v${vid}: ${describeVertex(vid)}`),
    }

    return NextResponse.json({
      action:          data.action,
      actionEs:        ACTION_ES[data.action] ?? data.action,
      score:           data.score,
      reason:          data.reason,
      positionContext,
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
