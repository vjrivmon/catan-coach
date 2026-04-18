'use client'
import { useEffect, useState } from 'react'

/**
 * Indicador de "el coach está pensando".
 * Además de los puntos animados, muestra un contador de segundos transcurridos
 * tras 2s de espera y un hint si la respuesta tarda más de lo habitual (~10s).
 * Mobile-first: evita spam de taps de "enviar" por impaciencia del usuario.
 */
export function TypingIndicator() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 250)
    return () => clearInterval(id)
  }, [])

  const showCounter = seconds >= 2
  const slow = seconds >= 10

  return (
    <div className="flex justify-start">
      <div className="bg-stone-700 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-3">
        <div className="flex gap-1 items-center h-4">
          <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        {showCounter && (
          <span className={`text-xs ${slow ? 'text-amber-400' : 'text-stone-400'}`}>
            {slow ? `Pensando… ${seconds}s (el LLM tarda un poco)` : `Pensando… ${seconds}s`}
          </span>
        )}
      </div>
    </div>
  )
}
