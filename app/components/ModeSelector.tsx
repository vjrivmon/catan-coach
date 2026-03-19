'use client'

interface ModeSelectorProps {
  mode: 'chatbot' | 'advisor'
  onChange: (mode: 'chatbot' | 'advisor') => void
}

export function ModeSelector({ mode, onChange }: ModeSelectorProps) {
  return (
    <div className="flex items-center bg-stone-700 rounded-lg p-0.5 gap-0.5">
      <button
        onClick={() => onChange('chatbot')}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          mode === 'chatbot'
            ? 'bg-amber-600 text-white'
            : 'text-stone-400 hover:text-stone-200'
        }`}
      >
        Chatbot
      </button>
      <button
        onClick={() => onChange('advisor')}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          mode === 'advisor'
            ? 'bg-amber-600 text-white'
            : 'text-stone-400 hover:text-stone-200'
        }`}
      >
        En Partida
      </button>
    </div>
  )
}
