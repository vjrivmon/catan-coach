'use client'

import { useState } from 'react'

const RESOURCES = [
  { key: 'wood',    label: 'Madera',   color: '#166534', emoji: '🌲' },
  { key: 'clay',    label: 'Arcilla',  color: '#b45309', emoji: '🧱' },
  { key: 'cereal',  label: 'Trigo',    color: '#ca8a04', emoji: '🌾' },
  { key: 'wool',    label: 'Oveja',    color: '#65a30d', emoji: '🐑' },
  { key: 'mineral', label: 'Mineral',  color: '#6b7280', emoji: '⛰️' },
] as const

type ResourceKey = (typeof RESOURCES)[number]['key']
type Counts = Record<ResourceKey, number>

interface ResourceStepperBubbleProps {
  onConfirm: (counts: Counts) => void
  initialValues?: Partial<Counts>  // pre-rellena el stepper con valores actuales
}

export function ResourceStepperBubble({ onConfirm, initialValues }: ResourceStepperBubbleProps) {
  const hasInitial = initialValues && Object.values(initialValues).some(v => (v ?? 0) > 0)

  const [counts, setCounts] = useState<Counts>({
    wood:    initialValues?.wood    ?? 0,
    clay:    initialValues?.clay    ?? 0,
    cereal:  initialValues?.cereal  ?? 0,
    wool:    initialValues?.wool    ?? 0,
    mineral: initialValues?.mineral ?? 0,
  })

  function adjust(key: ResourceKey, delta: number) {
    setCounts(c => ({ ...c, [key]: Math.max(0, Math.min(19, c[key] + delta)) }))
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="flex justify-start mb-3">
      <div className="bg-stone-700 border border-stone-600 rounded-2xl rounded-tl-sm p-4 max-w-[90%] w-full">
        <p className="text-stone-300 text-sm font-semibold mb-1">
          {hasInitial ? 'Confirma o corrige tus recursos' : '¿Cuántos recursos tienes ahora?'}
        </p>
        {hasInitial && (
          <p className="text-stone-500 text-xs mb-3">Ajusta si hay discrepancias con las cartas físicas</p>
        )}
        {!hasInitial && <div className="mb-3" />}

        {/* Compact inline display: resource chips */}
        <div className="grid grid-cols-5 gap-1.5 mb-3">
          {RESOURCES.map(({ key, color, emoji }) => (
            <div key={key} className="flex flex-col items-center gap-1">
              <span className="text-base leading-none">{emoji}</span>
              <div className="flex flex-col items-center gap-0.5 w-full">
                <button
                  onClick={() => adjust(key, 1)}
                  className="w-full h-6 flex items-center justify-center bg-stone-600 hover:bg-stone-500 active:bg-stone-400 text-stone-200 text-xs font-bold rounded-t transition-colors"
                >+</button>
                <span
                  className="w-full h-7 flex items-center justify-center text-sm font-bold text-white rounded-none"
                  style={{ background: counts[key] > 0 ? color : '#374151' }}
                >
                  {counts[key]}
                </span>
                <button
                  onClick={() => adjust(key, -1)}
                  className="w-full h-6 flex items-center justify-center bg-stone-600 hover:bg-stone-500 active:bg-stone-400 text-stone-200 text-xs font-bold rounded-b transition-colors"
                >−</button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => onConfirm(counts)}
          disabled={total === 0}
          className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-bold transition-colors"
        >
          {total === 0
            ? 'Indica tus recursos primero'
            : hasInitial
            ? `Confirmar (${total} cartas) →`
            : `Pedir recomendación (${total} cartas) →`}
        </button>
      </div>
    </div>
  )
}
