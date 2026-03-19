'use client'

import { useState } from 'react'

export interface PlayerState {
  color: 'red' | 'blue' | 'orange' | 'white'
  resources: { wood: number; brick: number; wheat: number; sheep: number; ore: number }
  vp: number
}

interface ResourceStepperProps {
  onConfirm: (player: PlayerState) => void
}

const RESOURCES = [
  { key: 'wood' as const,  label: 'Madera',  emoji: '🪵', color: 'text-green-400' },
  { key: 'brick' as const, label: 'Arcilla', emoji: '🧱', color: 'text-red-400' },
  { key: 'wheat' as const, label: 'Trigo',   emoji: '🌾', color: 'text-yellow-400' },
  { key: 'sheep' as const, label: 'Oveja',   emoji: '🐑', color: 'text-emerald-400' },
  { key: 'ore' as const,   label: 'Mineral', emoji: '⛏️', color: 'text-blue-400' },
]

const COLORS = [
  { key: 'red' as const,    label: 'Rojo',    bg: 'bg-red-600',    ring: 'ring-red-500' },
  { key: 'blue' as const,   label: 'Azul',    bg: 'bg-blue-600',   ring: 'ring-blue-500' },
  { key: 'orange' as const, label: 'Naranja', bg: 'bg-orange-500', ring: 'ring-orange-400' },
  { key: 'white' as const,  label: 'Blanco',  bg: 'bg-stone-100',  ring: 'ring-stone-300' },
]

export function ResourceStepper({ onConfirm }: ResourceStepperProps) {
  const [resources, setResources] = useState({ wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 })
  const [color, setColor] = useState<PlayerState['color']>('red')
  const [vp, setVp] = useState(2)

  function adjust(key: keyof typeof resources, delta: number) {
    setResources(r => ({ ...r, [key]: Math.max(0, Math.min(10, r[key] + delta)) }))
  }

  function handleConfirm() {
    onConfirm({ color, resources, vp })
  }

  const total = Object.values(resources).reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col gap-5">
      <p className="text-stone-300 text-sm">Indica tus recursos actuales y estado en la partida.</p>

      {/* Color selector */}
      <div>
        <p className="text-stone-400 text-xs uppercase tracking-wide mb-2">Color de jugador</p>
        <div className="flex gap-2">
          {COLORS.map(c => (
            <button
              key={c.key}
              onClick={() => setColor(c.key)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border-2 transition-all ${
                color === c.key ? 'border-amber-500 bg-stone-700' : 'border-transparent bg-stone-800 hover:bg-stone-750'
              }`}
            >
              <div className={`w-6 h-6 rounded-full ${c.bg} ${color === c.key ? `ring-2 ${c.ring} ring-offset-1 ring-offset-stone-800` : ''}`} />
              <span className="text-stone-300 text-xs">{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Puntos de victoria */}
      <div>
        <p className="text-stone-400 text-xs uppercase tracking-wide mb-2">Puntos de victoria</p>
        <div className="flex items-center gap-3 bg-stone-800 rounded-xl px-4 py-2 w-fit">
          <button
            onClick={() => setVp(v => Math.max(1, v - 1))}
            className="w-7 h-7 rounded-lg bg-stone-700 hover:bg-stone-600 text-stone-200 font-bold transition-colors flex items-center justify-center"
          >−</button>
          <span className="text-amber-400 font-bold text-lg w-6 text-center">{vp}</span>
          <button
            onClick={() => setVp(v => Math.min(10, v + 1))}
            className="w-7 h-7 rounded-lg bg-stone-700 hover:bg-stone-600 text-stone-200 font-bold transition-colors flex items-center justify-center"
          >+</button>
        </div>
      </div>

      {/* Recursos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-stone-400 text-xs uppercase tracking-wide">Recursos</p>
          <span className="text-stone-500 text-xs">{total} total</span>
        </div>
        <div className="flex flex-col gap-2">
          {RESOURCES.map(r => (
            <div key={r.key} className="flex items-center gap-3 bg-stone-800 rounded-xl px-4 py-2">
              <span className="text-lg w-7 text-center">{r.emoji}</span>
              <span className={`text-sm font-medium flex-1 ${r.color}`}>{r.label}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adjust(r.key, -1)}
                  disabled={resources[r.key] === 0}
                  className="w-7 h-7 rounded-lg bg-stone-700 hover:bg-stone-600 disabled:opacity-30 disabled:cursor-not-allowed text-stone-200 font-bold transition-colors flex items-center justify-center"
                >−</button>
                <span className="text-stone-100 font-semibold text-base w-5 text-center">{resources[r.key]}</span>
                <button
                  onClick={() => adjust(r.key, 1)}
                  disabled={resources[r.key] === 10}
                  className="w-7 h-7 rounded-lg bg-stone-700 hover:bg-stone-600 disabled:opacity-30 disabled:cursor-not-allowed text-stone-200 font-bold transition-colors flex items-center justify-center"
                >+</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleConfirm}
        className="bg-amber-600 hover:bg-amber-500 text-white rounded-xl py-2.5 px-4 text-sm font-medium transition-colors"
      >
        Obtener recomendación →
      </button>
    </div>
  )
}
