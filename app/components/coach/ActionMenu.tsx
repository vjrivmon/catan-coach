'use client'

import { useState, useRef, useEffect } from 'react'

export type GameAction =
  | 'update-resources'
  | 'add-dev-cards'
  | 'update-board'
  | 'next-turn'

interface ActionMenuProps {
  gameStarted: boolean
  boardConfigured: boolean
  onAction: (action: GameAction) => void
}

const ALL_ACTIONS: { id: GameAction; label: string; icon: React.ReactNode; showWhen: (gs: boolean, bc: boolean) => boolean }[] = [
  {
    id: 'update-resources',
    label: 'Actualizar recursos',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7"/>
      </svg>
    ),
    showWhen: (gs, bc) => bc,
  },
  {
    id: 'add-dev-cards',
    label: 'Cartas de desarrollo',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
      </svg>
    ),
    showWhen: (gs, bc) => gs && bc,
  },
  {
    id: 'update-board',
    label: 'Actualizar tablero',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
        <path d="M12 2L21.196 7V17L12 22L2.804 17V7L12 2Z"/>
      </svg>
    ),
    showWhen: (gs, bc) => bc,
  },
  {
    id: 'next-turn',
    label: 'Siguiente turno',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
      </svg>
    ),
    showWhen: (gs, bc) => gs && bc,
  },
]

export function ActionMenu({ gameStarted, boardConfigured, onAction }: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const visibleActions = ALL_ACTIONS.filter(a => a.showWhen(gameStarted, boardConfigured))

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (visibleActions.length === 0) return null

  return (
    <div ref={ref} className="relative shrink-0">
      {/* Popup menu — opens upward */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 bg-stone-800 border border-stone-600 rounded-2xl shadow-xl overflow-hidden z-50 min-w-[200px]">
          {visibleActions.map((action, i) => (
            <button
              key={action.id}
              onClick={() => { onAction(action.id); setOpen(false) }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-stone-200 hover:bg-stone-700 transition-colors ${
                i < visibleActions.length - 1 ? 'border-b border-stone-700' : ''
              }`}
            >
              <span className="text-amber-400 shrink-0">{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* + button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Acciones de partida"
        className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors shrink-0 border ${
          open
            ? 'bg-amber-600 border-amber-500 text-white'
            : 'bg-stone-700 border-stone-600 text-stone-300 hover:bg-stone-600 hover:text-amber-400 hover:border-amber-600'
        }`}
      >
        <svg className={`w-5 h-5 transition-transform ${open ? 'rotate-45' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M4 12h16"/>
        </svg>
      </button>
    </div>
  )
}

// ── Desktop action chips (shown above input on md+ screens) ──────────────────
export function ActionChips({ gameStarted, boardConfigured, onAction }: ActionMenuProps) {
  const visibleActions = ALL_ACTIONS.filter(a => a.showWhen(gameStarted, boardConfigured))
  if (visibleActions.length === 0) return null

  return (
    <div className="flex gap-2 flex-wrap">
      {visibleActions.map(action => (
        <button
          key={action.id}
          onClick={() => onAction(action.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-700 border border-stone-600 text-stone-300 hover:bg-stone-600 hover:text-amber-400 hover:border-amber-600 text-xs font-medium transition-colors"
        >
          <span className="text-amber-500">{action.icon}</span>
          {action.label}
        </button>
      ))}
    </div>
  )
}
