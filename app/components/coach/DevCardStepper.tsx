'use client'

import { useState } from 'react'

const DEV_CARDS = [
  { key: 'knight',         label: 'Caballero',            desc: 'Mover ladrón + robar' },
  { key: 'monopoly',       label: 'Monopolio',             desc: 'Robar un recurso a todos' },
  { key: 'year_of_plenty', label: 'Año de la Abundancia',  desc: 'Tomar 2 recursos del banco' },
  { key: 'road_building',  label: 'Construcción Caminos',  desc: 'Construir 2 caminos gratis' },
  { key: 'vp',             label: 'Punto de Victoria',     desc: 'Vale 1 PV oculto' },
] as const

type DevCardKey = typeof DEV_CARDS[number]['key']
type DevCardCounts = Record<DevCardKey, number>

interface DevCardStepperProps {
  onConfirm: (counts: DevCardCounts) => void
}

export function DevCardStepper({ onConfirm }: DevCardStepperProps) {
  const [counts, setCounts] = useState<DevCardCounts>({
    knight: 0, monopoly: 0, year_of_plenty: 0, road_building: 0, vp: 0,
  })

  function adjust(key: DevCardKey, delta: number) {
    setCounts(c => ({ ...c, [key]: Math.max(0, Math.min(14, c[key] + delta)) }))
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="flex justify-start mb-3">
      <div className="bg-stone-700 border border-stone-600 rounded-2xl rounded-tl-sm p-4 max-w-[90%] w-full">
        <p className="text-stone-300 text-sm font-semibold mb-3">
          Cartas de desarrollo en mano
        </p>

        <div className="flex flex-col gap-2.5">
          {DEV_CARDS.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-stone-200 text-sm">{label}</p>
                <p className="text-stone-500 text-xs">{desc}</p>
              </div>
              <div className="flex items-center gap-0 rounded-lg overflow-hidden border border-stone-600">
                <button
                  onClick={() => adjust(key, -1)}
                  className="w-8 h-8 flex items-center justify-center bg-stone-600 hover:bg-stone-500 text-stone-200 text-base font-bold transition-colors"
                >−</button>
                <span
                  className="w-8 h-8 flex items-center justify-center text-sm font-bold"
                  style={{ background: counts[key] > 0 ? '#92400e' : '#374151', color: 'white' }}
                >
                  {counts[key]}
                </span>
                <button
                  onClick={() => adjust(key, 1)}
                  className="w-8 h-8 flex items-center justify-center bg-stone-600 hover:bg-stone-500 text-stone-200 text-base font-bold transition-colors"
                >+</button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => onConfirm(counts)}
          className="mt-4 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-colors"
        >
          {total === 0 ? 'Confirmar (sin cartas)' : `Confirmar (${total} carta${total !== 1 ? 's' : ''}) →`}
        </button>
      </div>
    </div>
  )
}
