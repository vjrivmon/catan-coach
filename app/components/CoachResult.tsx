'use client'

interface Alternative {
  action: string
  reason: string
  score: number
}

export interface CoachRecommendation {
  action: string
  target?: Record<string, unknown> | null
  reason: string
  score: number
  alternatives?: Alternative[]
}

const ACTION_LABELS: Record<string, string> = {
  build_settlement: 'Construir Asentamiento',
  build_city:       'Construir Ciudad',
  build_road:       'Construir Camino',
  buy_dev_card:     'Comprar Carta de Desarrollo',
  trade:            'Intercambiar Recursos',
  pass:             'Pasar Turno',
}

const ACTION_EMOJIS: Record<string, string> = {
  build_settlement: '🏠',
  build_city:       '🏙️',
  build_road:       '🛤️',
  buy_dev_card:     '🃏',
  trade:            '🔄',
  pass:             '⏭️',
}

interface CoachResultProps {
  recommendation: CoachRecommendation
  onReset: () => void
}

export function CoachResult({ recommendation, onReset }: CoachResultProps) {
  const label = ACTION_LABELS[recommendation.action] ?? recommendation.action
  const emoji = ACTION_EMOJIS[recommendation.action] ?? '🎯'
  const scorePct = Math.round(recommendation.score * 100)

  return (
    <div className="flex flex-col gap-4">
      {/* Acción principal */}
      <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{emoji}</span>
          <div>
            <p className="text-stone-400 text-xs uppercase tracking-wide">Recomendación</p>
            <p className="text-amber-300 font-bold text-lg leading-tight">{label}</p>
          </div>
        </div>

        {/* Score */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-stone-400 text-xs">Confianza</span>
            <span className="text-amber-400 text-xs font-semibold">{scorePct}%</span>
          </div>
          <div className="h-2 bg-stone-700 rounded-full overflow-hidden">
            <div
              className="h-2 bg-amber-500 rounded-full transition-all"
              style={{ width: `${scorePct}%` }}
            />
          </div>
        </div>

        {/* Razón */}
        <p className="text-stone-300 text-sm leading-relaxed">{recommendation.reason}</p>
      </div>

      {/* Alternativas */}
      {recommendation.alternatives && recommendation.alternatives.length > 0 && (
        <div>
          <p className="text-stone-400 text-xs uppercase tracking-wide mb-2">Alternativas</p>
          <div className="flex flex-col gap-2">
            {recommendation.alternatives.map((alt, i) => (
              <div key={i} className="bg-stone-800 border border-stone-700 rounded-xl px-4 py-3 flex items-start gap-3">
                <span className="text-stone-400 text-sm font-mono mt-0.5">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-stone-200 text-sm font-medium">{ACTION_LABELS[alt.action] ?? alt.action}</p>
                  <p className="text-stone-400 text-xs mt-0.5 leading-relaxed">{alt.reason}</p>
                </div>
                <span className="text-stone-500 text-xs shrink-0 mt-0.5">{Math.round(alt.score * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onReset}
        className="bg-stone-700 hover:bg-stone-600 text-stone-200 rounded-xl py-2.5 px-4 text-sm font-medium transition-colors"
      >
        Nueva consulta
      </button>
    </div>
  )
}
