import { NextRequest, NextResponse } from 'next/server'

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
}

export async function POST(req: NextRequest) {
  try {
    const body: CoachRecommendInput = await req.json()

    // Translate frontend resource keys → API keys (brick=clay, sheep=wool, wheat=cereal)
    const resources = {
      wood:  body.resources.wood    ?? 0,
      brick: body.resources.clay    ?? 0,   // frontend uses "clay", API uses "brick"
      sheep: body.resources.wool    ?? 0,   // frontend uses "wool", API uses "sheep"
      wheat: body.resources.cereal  ?? 0,   // frontend uses "cereal", API uses "wheat"
      ore:   body.resources.mineral ?? 0,   // frontend uses "mineral", API uses "ore"
    }

    // Translate edge ids "lo_hi" → [lo, hi] tuples
    const roads = (body.roads ?? []).map(id => {
      const parts = id.replace(/^e/, '').split('_').map(Number)
      return parts.length === 2 ? parts : [0, 1]
    })

    const payload = {
      board_state: { hexes: [], vertices: [], ports: [] },
      player: {
        color: 'red',
        resources,
        settlements: body.settlements ?? [],
        cities: body.cities ?? [],
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
