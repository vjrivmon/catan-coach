import ReactMarkdown from 'react-markdown'
import type { Message, BoardRecommendation } from '@/src/domain/entities'

const PIECE_LABEL: Record<BoardRecommendation['type'], string> = {
  road:       'Camino',
  settlement: 'Poblado',
  city:       'Ciudad',
}

const PIECE_ICON: Record<BoardRecommendation['type'], React.ReactNode> = {
  road: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l6-16"/>
    </svg>
  ),
  settlement: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    </svg>
  ),
  city: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3M9 7h1m-1 4h1m4-4h1m-1 4h1M9 21v-4a2 2 0 012-2h2a2 2 0 012 2v4"/>
    </svg>
  ),
}

interface Props {
  message: Message
  isStreaming?: boolean
  onShowRecommendation?: (rec: BoardRecommendation) => void
}

export function MessageBubble({ message, isStreaming, onShowRecommendation }: Props) {
  const isUser = message.role === 'user'
  const rec    = message.boardRecommendation

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-amber-600 text-white rounded-br-sm'
            : 'bg-stone-700 text-stone-100 rounded-bl-sm'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none
            prose-p:my-1 prose-p:leading-relaxed
            prose-strong:text-white prose-strong:font-semibold
            prose-ul:my-1 prose-ul:pl-4 prose-ul:space-y-0.5
            prose-ol:my-1 prose-ol:pl-4 prose-ol:space-y-0.5
            prose-li:my-0
            prose-headings:text-stone-200 prose-headings:font-semibold prose-headings:my-2
          ">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}

        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-amber-400 ml-0.5 animate-pulse align-middle" />
        )}

        {/* Fase 2 — botón "Ver en tablero" cuando hay recomendación de posición */}
        {!isStreaming && rec && onShowRecommendation && (
          <div className="mt-3 pt-2.5 border-t border-stone-600">
            <button
              onClick={() => onShowRecommendation(rec)}
              className="w-full px-3 py-2 rounded-xl
                bg-amber-700/40 hover:bg-amber-700/60 border border-amber-600/50
                hover:border-amber-500 text-amber-300 hover:text-amber-200
                text-xs font-semibold transition-colors group"
            >
              <span className="flex items-center gap-2">
                <span className="text-amber-400 shrink-0">{PIECE_ICON[rec.type]}</span>
                <span className="flex-1 text-left">
                  Ver {PIECE_LABEL[rec.type]} recomendado en tablero
                </span>
                <svg className="w-4 h-4 shrink-0 text-stone-400 group-hover:text-amber-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </span>
              {rec.label && (
                <span className="block text-stone-400 group-hover:text-amber-400 text-[10px] mt-1 truncate text-left">
                  {rec.label}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
