'use client'

import { useState } from 'react'

const STEPS = [
  {
    title: 'Bienvenido a Catan Coach',
    body: 'Te ayudo a aprender y mejorar en Catan. Puedes preguntarme sobre reglas, estrategia, o usarme como asistente en partida real.',
    icon: (
      <svg className="w-12 h-12 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round">
        <path d="M12 2L21.196 7V17L12 22L2.804 17V7L12 2Z"/>
        <path d="M12 7L17 9.8V15.2L12 18L7 15.2V9.8L12 7Z" fill="currentColor" fillOpacity="0.25"/>
      </svg>
    ),
  },
  {
    title: '3 formas de empezar',
    body: null,
    icon: null,
    custom: (
      <div className="flex flex-col gap-3 mt-2">
        <div className="flex items-start gap-3 bg-stone-700/60 rounded-xl p-3">
          <svg className="w-7 h-7 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
            <circle cx="12" cy="13" r="3"/>
          </svg>
          <div>
            <p className="text-stone-100 text-sm font-semibold">Escanear tablero</p>
            <p className="text-stone-400 text-xs mt-0.5">Haz una foto a tu partida real</p>
          </div>
        </div>
        <div className="flex items-start gap-3 bg-stone-700/60 rounded-xl p-3">
          <svg className="w-7 h-7 text-amber-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
            <path d="M12 2L21.196 7V17L12 22L2.804 17V7L12 2Z"/>
          </svg>
          <div>
            <p className="text-stone-100 text-sm font-semibold">Tablero interactivo</p>
            <p className="text-stone-400 text-xs mt-0.5">Coloca tus piezas manualmente y recibe recomendaciones en tiempo real</p>
          </div>
        </div>
        <div className="flex items-start gap-3 bg-stone-700/60 rounded-xl p-3">
          <svg className="w-7 h-7 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
          </svg>
          <div>
            <p className="text-stone-100 text-sm font-semibold">Solo dudas</p>
            <p className="text-stone-400 text-xs mt-0.5">Pregunta sobre reglas y estrategia sin necesidad de tablero</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'Reglas de colocacion inicial',
    body: null,
    icon: null,
    custom: (
      <div className="flex flex-col gap-2.5 mt-2 text-sm text-stone-300">
        <div className="flex items-start gap-2">
          <span className="text-amber-400 font-bold shrink-0">2</span>
          <span>poblados por jugador - colocalos en vertices del tablero</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-amber-400 font-bold shrink-0">4</span>
          <span>caminos por jugador - conectados a tus poblados</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-amber-400 font-bold shrink-0">[flecha]</span>
          <span>Regla de distancia: nunca coloques un poblado adyacente a otro</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-red-400 font-bold shrink-0">X</span>
          <span>Las ciudades no estan disponibles en la fase inicial</span>
        </div>
        <div className="bg-stone-700/60 rounded-xl p-3 mt-1">
          <p className="text-stone-400 text-xs">El boton "Confirmar tablero" se activa cuando todos los jugadores han colocado sus piezas.</p>
        </div>
      </div>
    ),
  },
  {
    title: 'Flujo coach: como funciona',
    body: null,
    icon: null,
    custom: (
      <div className="flex flex-col gap-2.5 mt-2 text-sm text-stone-300">
        <div className="flex items-start gap-2">
          <span className="text-green-400 font-bold shrink-0">1</span>
          <span>Configura el tablero con las piezas de todos los jugadores</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-green-400 font-bold shrink-0">2</span>
          <span>Indica tus recursos en mano (madera, arcilla, trigo, lana, mineral)</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-green-400 font-bold shrink-0">3</span>
          <span>El coach analiza el tablero y te recomienda la mejor jugada</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-amber-400 font-bold shrink-0">4</span>
          <span>Pulsa el boton naranja <strong className="text-amber-300">"Ver en tablero"</strong> para visualizar la posicion</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-amber-400 font-bold shrink-0">5</span>
          <span>Veras un <strong className="text-amber-300">aura pulsante</strong> sobre el vertice o arista recomendado</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-green-400 font-bold shrink-0">6</span>
          <span>Confirma la jugada o descarta para seguir explorando</span>
        </div>
      </div>
    ),
  },
  {
    title: 'Durante la partida',
    body: null,
    icon: null,
    custom: (
      <div className="flex flex-col gap-2.5 mt-2 text-sm text-stone-300">
        <div className="flex items-start gap-2">
          <span className="text-green-400 font-bold shrink-0">[play]</span>
          <span>Pulsa <strong className="text-stone-100">"Iniciar partida"</strong> cuando todos hayan colocado sus piezas</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-amber-400 font-bold shrink-0">[dado]</span>
          <span>Introduce el numero del dado cada turno - el coach calcula produccion</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-blue-400 font-bold shrink-0">[hex]</span>
          <span>Usa el icono del hexagono para abrir el tablero en cualquier momento</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-red-400 font-bold shrink-0">[7]</span>
          <span>Si sale un 7, el tablero se abre automaticamente en modo "Mover ladron"</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-amber-400 font-bold shrink-0">[puerto]</span>
          <span>Toca los puertos del borde para marcar cuales tienes (mejoran tu comercio)</span>
        </div>
        <div className="bg-amber-900/30 border border-amber-700/40 rounded-xl p-3 mt-1">
          <p className="text-amber-300 text-xs">Cuantas mas piezas y puertos marques, mas precisa sera la recomendacion del agente.</p>
        </div>
      </div>
    ),
  },
]

interface OnboardingModalProps {
  onDone: () => void
}

export function OnboardingModal({ onDone }: OnboardingModalProps) {
  const [step, setStep] = useState(0)
  const isLast = step === STEPS.length - 1
  const s = STEPS[step]

  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
    >
      <div
        className="bg-stone-800 rounded-t-3xl px-6 pt-6 pb-8 w-full max-w-lg flex flex-col gap-4"
        style={{ animation: 'slideUp 0.3s ease' }}
      >
        {/* Step indicator */}
        <div className="flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${i === step ? 'w-6 bg-amber-500' : 'w-2 bg-stone-600'}`}
            />
          ))}
        </div>

        {/* Icon */}
        {s.icon && (
          <div className="flex justify-center">{s.icon}</div>
        )}

        {/* Title */}
        <h2 className="text-stone-100 font-bold text-xl text-center">{s.title}</h2>

        {/* Body */}
        {s.body && (
          <p className="text-stone-400 text-sm text-center leading-relaxed">{s.body}</p>
        )}

        {/* Custom content */}
        {s.custom}

        {/* Actions */}
        <div className="flex gap-3 mt-2">
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex-1 py-2.5 rounded-xl border border-stone-600 text-stone-300 text-sm font-semibold hover:bg-stone-700 transition-colors"
            >
              Anterior
            </button>
          )}
          <button
            onClick={() => isLast ? onDone() : setStep(s => s + 1)}
            className="flex-[2] py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-colors"
          >
            {isLast ? 'Empezar' : 'Siguiente'}
          </button>
        </div>

        {/* Skip */}
        {!isLast && (
          <button
            onClick={onDone}
            className="text-center text-stone-500 text-xs hover:text-stone-300 transition-colors"
          >
            Saltar tutorial
          </button>
        )}
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
