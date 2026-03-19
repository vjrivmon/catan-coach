'use client'

import { useState } from 'react'
import { BoardUpload } from './BoardUpload'
import { ResourceStepper, type PlayerState } from './ResourceStepper'
import { CoachResult, type CoachRecommendation } from './CoachResult'

type Step = 1 | 2 | 3

interface BoardState {
  hexes: unknown[]
  vertices: unknown[]
  ports: unknown[]
  [key: string]: unknown
}

const STEPS = [
  { label: 'Tablero',   num: 1 },
  { label: 'Recursos',  num: 2 },
  { label: 'Consejo',   num: 3 },
]

export function AdvisorMode() {
  const [step, setStep] = useState<Step>(1)
  const [boardState, setBoardState] = useState<BoardState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recommendation, setRecommendation] = useState<CoachRecommendation | null>(null)

  function handleBoardConfirm(state: BoardState) {
    setBoardState(state)
    setStep(2)
  }

  async function handlePlayerConfirm(player: PlayerState) {
    setLoading(true)
    setError(null)
    setStep(3)
    try {
      const res = await fetch('http://localhost:8000/coach/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_state: boardState,
          player: {
            color: player.color,
            resources: player.resources,
            settlements: [],
            cities: [],
            roads: [],
            dev_cards: { knight: 0, vp: 0, monopoly: 0, road_building: 0, year_of_plenty: 0 },
            vp: player.vp,
          },
          game_phase: 'playing',
          turn: 1,
          num_players: 4,
        }),
      })
      if (!res.ok) throw new Error(`Error del servidor: ${res.status}`)
      const data: CoachRecommendation = await res.json()
      setRecommendation(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setError(
        msg.includes('fetch') || msg.includes('Failed')
          ? 'El servidor de análisis no está disponible. Asegúrate de que catan-advisor-api está corriendo en http://localhost:8000.'
          : msg
      )
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setStep(1)
    setBoardState(null)
    setRecommendation(null)
    setError(null)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Stepper header */}
      <div className="shrink-0 px-4 py-3 border-b border-stone-700 bg-stone-800/50">
        <div className="flex items-center justify-between max-w-sm mx-auto">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center gap-1.5">
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors ${
                step === s.num
                  ? 'bg-amber-600 text-white'
                  : step > s.num
                  ? 'bg-green-600 text-white'
                  : 'bg-stone-700 text-stone-400'
              }`}>
                {step > s.num ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : s.num}
              </div>
              <span className={`text-xs transition-colors ${step === s.num ? 'text-stone-200 font-medium' : 'text-stone-500'}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-px mx-1 transition-colors ${step > s.num ? 'bg-green-600' : 'bg-stone-600'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-lg mx-auto">
          {step === 1 && (
            <BoardUpload onConfirm={handleBoardConfirm} />
          )}

          {step === 2 && (
            <ResourceStepper onConfirm={handlePlayerConfirm} />
          )}

          {step === 3 && (
            <>
              {loading && (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-stone-400">
                  <svg className="animate-spin w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-sm">Calculando la mejor jugada...</p>
                </div>
              )}

              {error && !loading && (
                <div className="flex flex-col gap-3">
                  <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm">
                    {error}
                  </div>
                  <button
                    onClick={handleReset}
                    className="bg-stone-700 hover:bg-stone-600 text-stone-200 rounded-xl py-2.5 px-4 text-sm font-medium transition-colors"
                  >
                    Nueva consulta
                  </button>
                </div>
              )}

              {recommendation && !loading && (
                <CoachResult recommendation={recommendation} onReset={handleReset} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
