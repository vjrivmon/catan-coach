'use client'

import { useState } from 'react'

const RESOURCES = [
  { key: 'wood',    label: 'Madera',   color: '#166534', emoji: '🪵' },
  { key: 'clay',    label: 'Arcilla',  color: '#b45309', emoji: '🧱' },
  { key: 'cereal',  label: 'Trigo',    color: '#ca8a04', emoji: '🌾' },
  { key: 'wool',    label: 'Oveja',    color: '#65a30d', emoji: '🐑' },
  { key: 'mineral', label: 'Mineral',  color: '#6b7280', emoji: '⛏️' },
] as const

type ResourceKey = typeof RESOURCES[number]['key']
type Counts = Record<ResourceKey, number>

interface ResourceStepperBubbleProps {
  onConfirm: (counts: Counts) => void
}

export function ResourceStepperBubble({ onConfirm }: ResourceStepperBubbleProps) {
  const [counts, setCounts] = useState<Counts>({
    wood: 0, clay: 0, cereal: 0, wool: 0, mineral: 0,
  })

  function adjust(key: ResourceKey, delta: number) {
    setCounts(c => ({ ...c, [key]: Math.max(0, Math.min(19, c[key] + delta)) }))
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="flex justify-start mb-3">
      <div className="bg-stone-700 border border-stone-600 rounded-2xl rounded-tl-sm p-4 max-w-[90%] w-full">
        <p className="text-stone-300 text-sm font-semibold mb-3">
          ¿Cuántos recursos tienes ahora?
        </p>

        <div className="flex flex-col gap-2">
          {RESOURCES.map(({ key, label, color, emoji }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-base w-5 shrink-0">{emoji}</span>
              <span className="text-stone-200 text-sm flex-1">{label}</span>
              <div className="flex items-center gap-0 rounded-lg overflow-hidden border border-stone-600">
                <button
                  onClick={() => adjust(key, -1)}
                  className="w-8 h-8 flex items-center justify-center bg-stone-600 hover:bg-stone-500 active:bg-stone-400 text-stone-200 text-base font-bold transition-colors"
                >−</button>
                <span
                  className="w-8 h-8 flex items-center justify-center text-sm font-bold text-white"
                  style={{ background: counts[key] > 0 ? color : '#374151' }}
                >
                  {counts[key]}
                </span>
                <button
                  onClick={() => adjust(key, 1)}
                  className="w-8 h-8 flex items-center justify-center bg-stone-600 hover:bg-stone-500 active:bg-stone-400 text-stone-200 text-base font-bold transition-colors"
                >+</button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => onConfirm(counts)}
          disabled={total === 0}
          className="mt-4 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-bold transition-colors"
        >
          {total === 0 ? 'Indica tus recursos' : `Pedir recomendación (${total} recursos) →`}
        </button>
      </div>
    </div>
  )
}
