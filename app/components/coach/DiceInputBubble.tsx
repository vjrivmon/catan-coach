'use client'

import { useState } from 'react'

// Probabilidades de cada número (dots / 36)
const DICE_PROBS: Record<number, number> = {
  2:1, 3:2, 4:3, 5:4, 6:5, 7:6, 8:5, 9:4, 10:3, 11:2, 12:1
}

interface DiceInputBubbleProps {
  mode: 'manual' | 'auto'
  onConfirm: (value: number) => void
}

export function DiceInputBubble({ mode, onConfirm }: DiceInputBubbleProps) {
  const [selected, setSelected] = useState<number | null>(null)
  // Guard contra double-tap: un solo onConfirm por bubble.
  const [submitted, setSubmitted] = useState(false)

  function rollDice(): number {
    // Weighted random — simulates 2d6
    const d1 = Math.floor(Math.random() * 6) + 1
    const d2 = Math.floor(Math.random() * 6) + 1
    return d1 + d2
  }

  const handleConfirm = (value: number) => {
    if (submitted) return
    setSubmitted(true)
    onConfirm(value)
  }

  const numbers = [2,3,4,5,6,7,8,9,10,11,12]

  return (
    <div className="flex justify-start mb-3">
      <div className="bg-stone-700 border border-stone-600 rounded-2xl rounded-tl-sm p-4 max-w-[90%] w-full">
        <p className="text-stone-300 text-sm font-semibold mb-3">
          {mode === 'auto' ? 'Tirar dados' : '¿Qué número ha salido?'}
        </p>

        {mode === 'manual' ? (
          <>
            <div className="grid grid-cols-6 gap-1.5 mb-4">
              {numbers.map(n => {
                const isHot = n === 6 || n === 8
                const dots = DICE_PROBS[n]
                const isSelected = selected === n
                return (
                  <button
                    key={n}
                    onClick={() => setSelected(n)}
                    className={`flex flex-col items-center justify-center rounded-lg py-2 px-1 border text-xs font-bold transition-all ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                        : isHot
                          ? 'border-red-700 bg-red-950/40 text-red-400 hover:border-red-500'
                          : n === 7
                            ? 'border-yellow-700 bg-yellow-950/30 text-yellow-500 hover:border-yellow-500'
                            : 'border-stone-600 bg-stone-800 text-stone-300 hover:border-stone-400'
                    }`}
                  >
                    <span className="text-sm">{n}</span>
                    <span className="text-[9px] opacity-60 mt-0.5">
                      {'•'.repeat(dots)}
                    </span>
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => selected !== null && handleConfirm(selected)}
              disabled={selected === null || submitted}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-bold transition-colors"
            >
              {submitted ? 'Enviando…' : selected === null ? 'Selecciona el número' : `Confirmar: ${selected} →`}
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              if (submitted) return
              const rolled = rollDice()
              setSelected(rolled)
              handleConfirm(rolled)
            }}
            disabled={submitted}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-bold transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <rect x="3" y="3" width="18" height="18" rx="3"/>
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
              <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/>
            </svg>
            Tirar dados
          </button>
        )}

        {/* Leyenda probabilidades */}
        <div className="mt-3 flex gap-3 text-[10px] text-stone-500">
          <span className="text-red-400">6/8 = alta prob.</span>
          <span className="text-yellow-600">7 = ladrón</span>
          <span>2/12 = baja prob.</span>
        </div>
      </div>
    </div>
  )
}
