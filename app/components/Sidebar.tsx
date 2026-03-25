'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import type { Conversation } from '@/src/domain/entities'

interface Props {
  conversations: Conversation[]
  activeId: string
  onSelect: (conv: Conversation) => void
  onNew: () => void
  onClose: () => void
}

function groupByDate(conversations: Conversation[]): Record<string, Conversation[]> {
  const now = Date.now()
  const dayMs = 86_400_000
  const today = new Date().setHours(0, 0, 0, 0)
  const yesterday = today - dayMs
  const weekAgo = today - 6 * dayMs

  const groups: Record<string, Conversation[]> = {
    Hoy: [],
    Ayer: [],
    'Esta semana': [],
    Anteriores: [],
  }

  for (const c of conversations) {
    const d = c.lastActiveAt
    if (d >= today) groups['Hoy'].push(c)
    else if (d >= yesterday) groups['Ayer'].push(c)
    else if (d >= weekAgo) groups['Esta semana'].push(c)
    else groups['Anteriores'].push(c)
  }

  return groups
}

function timeLabel(ts: number): string {
  const now = Date.now()
  const today = new Date().setHours(0, 0, 0, 0)
  if (ts >= today) {
    return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = today - 86_400_000
  if (ts >= yesterday) return 'Ayer'
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

// Título limpio para mostrar en el historial
function cleanTitle(conv: Conversation): string {
  // Intentar sacar el primer mensaje de usuario real (no mensajes de sistema)
  const SYSTEM_PREFIXES = [
    /^Tablero (configurado|actualizado|listo)/i,
    /^Recursos confirmados:/i,
    /^Cartas:/i,
    /^Sin cartas de desarrollo/i,
    /^Dado:/i,
    /^Jugada realizada:/i,
    /^Partida iniciada/i,
  ]
  const firstRealUserMsg = conv.session.messages.find(m =>
    m.role === 'user' && !SYSTEM_PREFIXES.some(p => p.test(m.content))
  )
  if (firstRealUserMsg) {
    const t = firstRealUserMsg.content.trim()
    return t.length > 40 ? t.slice(0, 40) + '…' : t
  }
  // Fallback: limpiar el título guardado
  const raw = conv.title
  const cleaned = raw
    .replace(/^Tablero (configurado|actualizado|listo)[^—]*—\s*/i, '')
    .replace(/^Tablero (configurado|actualizado|listo)\s*/i, '')
    .trim()
  return cleaned.length > 0 ? cleaned : raw
}

// Preview del último mensaje del asistente, limpiado de markdown
function lastAssistantPreview(conv: Conversation): string {
  const msg = conv.session.messages.filter(m => m.role === 'assistant').at(-1)
  if (!msg) return ''
  return msg.content
    .replace(/\*\*(.+?)\*\*/g, '$1')  // negrita
    .replace(/#+\s/g, '')              // headers
    .replace(/`[^`]+`/g, '')           // código
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 60)
}

export function Sidebar({ conversations, activeId, onSelect, onNew, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  // Swipe-to-close: track touch start X
  const touchStartX = useRef<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const touchStartY = useRef<number | null>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return
    const deltaX = touchStartX.current - e.changedTouches[0].clientX
    const deltaY = Math.abs(touchStartY.current - e.changedTouches[0].clientY)
    // Solo activar si el movimiento es más horizontal que vertical y suficientemente largo
    if (deltaX > 50 && deltaX > deltaY * 1.5) {
      onClose()
    }
    touchStartX.current = null
    touchStartY.current = null
  }, [onClose])

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations
    const q = search.toLowerCase()
    return conversations.filter(c => c.title.toLowerCase().includes(q))
  }, [conversations, search])

  const groups = useMemo(() => groupByDate(filtered), [filtered])

  // Indicador de scroll-down: sólo visible si hay contenido que hacer scroll
  const listRef = useRef<HTMLDivElement>(null)
  const [showScrollIndicator, setShowScrollIndicator] = useState(false)

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
    setShowScrollIndicator(!atBottom && el.scrollHeight > el.clientHeight)
  }, [])

  return (
    <div
      ref={panelRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="flex flex-col h-full w-full sm:w-60 bg-stone-900 border-r border-stone-700/50 overflow-hidden"
    >
      {/* Header — SIN botón X (el header principal ya lo tiene) */}
      <div className="px-3 pt-3 pb-2 border-b border-stone-700/50 shrink-0">
        <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-2">
          Historial
        </p>
        {/* Search */}
        <div className="flex items-center gap-2 bg-stone-800 rounded-lg px-3 py-2">
          <svg className="w-3.5 h-3.5 text-stone-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="flex-1 bg-transparent text-sm text-stone-200 placeholder-stone-500 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-stone-500 hover:text-stone-300">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Conversation list — scrollbar naranja, sin scroll horizontal */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden sidebar-list"
      >
        <style>{`
          .sidebar-list::-webkit-scrollbar { width: 3px; }
          .sidebar-list::-webkit-scrollbar-track { background: transparent; }
          .sidebar-list::-webkit-scrollbar-thumb { background: #b45309; border-radius: 99px; }
          .sidebar-list { scrollbar-width: thin; scrollbar-color: #b45309 transparent; }
        `}</style>

        {Object.entries(groups).map(([label, convs]) => {
          if (convs.length === 0) return null
          return (
            <div key={label}>
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-stone-600 uppercase tracking-wider">
                {label}
              </p>
              {convs.map(conv => {
                const isActive = conv.id === activeId
                const isExpanded = expanded === conv.id
                const title = cleanTitle(conv)
                const preview = lastAssistantPreview(conv)

                return (
                  <div key={conv.id} className="w-full">
                    {/* Fila principal: click → seleccionar, botón expand → colapsar/expandir */}
                    <div className={`flex items-stretch border-l-2 transition-colors ${
                      isActive
                        ? 'border-amber-600 bg-stone-800/80'
                        : 'border-transparent hover:bg-stone-800/50'
                    }`}>
                      <button
                        onClick={() => { onSelect(conv); setExpanded(null) }}
                        className="flex-1 text-left px-3 py-2.5 min-w-0"
                      >
                        <div className="flex items-baseline justify-between gap-1">
                          <span className={`text-sm font-medium leading-snug min-w-0 ${
                            isExpanded ? 'break-words whitespace-normal' : 'truncate'
                          } ${isActive ? 'text-amber-100' : 'text-stone-300'}`}>
                            {title}
                          </span>
                          <span className="text-[10px] text-stone-600 shrink-0 ml-1">
                            {timeLabel(conv.lastActiveAt)}
                          </span>
                        </div>
                        {/* Preview: truncado por defecto, expandido al pulsar ˅ */}
                        {preview && (
                          <p className={`text-xs text-stone-500 mt-0.5 leading-relaxed ${
                            isExpanded ? 'line-clamp-4' : 'truncate'
                          }`}>
                            {preview}
                          </p>
                        )}
                      </button>

                      {/* Botón expand/collapse — chevron naranja */}
                      <button
                        onClick={e => { e.stopPropagation(); setExpanded(isExpanded ? null : conv.id) }}
                        className="px-2 flex items-center text-stone-600 hover:text-amber-500 transition-colors shrink-0"
                        aria-label={isExpanded ? 'Colapsar' : 'Expandir'}
                      >
                        <svg
                          className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <p className="px-4 py-6 text-xs text-stone-600 text-center">
            {search ? 'Sin resultados' : 'Aún no hay conversaciones'}
          </p>
        )}

        {/* Padding final para que el scroll indicator no tape el último item */}
        <div className="h-6" />
      </div>

      {/* Indicador de scroll-down — naranja, se oculta cuando estás al final */}
      {showScrollIndicator && (
        <div className="pointer-events-none absolute bottom-14 left-0 right-0 flex justify-center">
          <div className="flex flex-col items-center gap-0.5 opacity-70">
            <div className="w-4 h-4 rounded-full bg-amber-600 flex items-center justify-center shadow-lg">
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7"/>
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-3 py-3 border-t border-stone-700/50 shrink-0">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-stone-700 text-stone-400 text-sm hover:bg-stone-800 hover:text-stone-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Nueva conversación
        </button>
      </div>
    </div>
  )
}
