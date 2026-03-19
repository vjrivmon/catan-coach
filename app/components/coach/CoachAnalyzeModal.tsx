'use client'

interface CoachAnalyzeModalProps {
  onClose: () => void
  onPhoto: () => void
  onBoard: () => void
}

export function CoachAnalyzeModal({ onClose, onPhoto, onBoard }: CoachAnalyzeModalProps) {
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="bg-stone-800 rounded-t-3xl p-5 pb-8 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideUp 0.25s ease' }}
      >
        <div className="w-9 h-1 rounded-full bg-stone-600 mx-auto mb-1" />
        <p className="text-center text-stone-100 font-bold text-lg">Analizar tablero</p>
        <p className="text-center text-stone-400 text-sm -mt-2">¿Cómo quieres introducir tu partida?</p>

        {/* Foto */}
        <button
          onClick={onPhoto}
          className="flex items-center gap-4 bg-stone-700 hover:bg-stone-650 border border-stone-600 hover:border-amber-600 rounded-2xl p-5 text-left transition-colors group"
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-900/50 flex items-center justify-center shrink-0 group-hover:bg-amber-800/60 transition-colors">
            <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-stone-100 font-semibold text-base">Foto del tablero</p>
            <p className="text-stone-400 text-sm mt-0.5">Apunta la cámara y encuadra tu partida real</p>
          </div>
          <svg className="w-5 h-5 text-stone-500 group-hover:text-amber-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
        </button>

        {/* Tablero interactivo */}
        <button
          onClick={onBoard}
          className="flex items-center gap-4 bg-stone-700 hover:bg-stone-650 border border-stone-600 hover:border-amber-600 rounded-2xl p-5 text-left transition-colors group"
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-900/50 flex items-center justify-center shrink-0 group-hover:bg-amber-800/60 transition-colors">
            <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinejoin="round" d="M12 2L21.196 7V17L12 22L2.804 17V7L12 2Z"/>
              <path strokeLinejoin="round" fill="rgba(245,158,11,0.2)" d="M12 7L17 9.8V15.2L12 18L7 15.2V9.8L12 7Z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-stone-100 font-semibold text-base">Tablero interactivo</p>
            <p className="text-stone-400 text-sm mt-0.5">Coloca tus piezas y las de los rivales</p>
          </div>
          <svg className="w-5 h-5 text-stone-500 group-hover:text-amber-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
