'use client'

import { useState, useMemo } from 'react'
import type { Conversation } from '@/src/domain/entities'

interface Props {
  conversations: Conversation[]
  activeId: string
  onSelect: (conv: Conversation) => void
  onNew: () => void
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

export function Sidebar({ conversations, activeId, onSelect, onNew }: Props) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations
    const q = search.toLowerCase()
    return conversations.filter(c => c.title.toLowerCase().includes(q))
  }, [conversations, search])

  const groups = useMemo(() => groupByDate(filtered), [filtered])

  return (
    <div className="flex flex-col h-full w-full sm:w-60 bg-stone-800 border-r border-stone-700 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-3 border-b border-stone-700 shrink-0">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Historial</p>
        {/* Search — sin emojis, mismo estilo que el input principal */}
        <div className="flex items-center gap-2 bg-stone-900 rounded-lg px-3 py-2">
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

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(groups).map(([label, convs]) => {
          if (convs.length === 0) return null
          return (
            <div key={label}>
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-stone-600 uppercase tracking-wider">
                {label}
              </p>
              {convs.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv)}
                  className={`w-full text-left px-3 py-2.5 border-l-2 transition-colors ${
                    conv.id === activeId
                      ? 'border-amber-600 bg-stone-700/60'
                      : 'border-transparent hover:bg-stone-700/40'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <span className={`text-sm truncate font-medium ${
                      conv.id === activeId ? 'text-amber-100' : 'text-stone-300'
                    }`}>
                      {conv.title}
                    </span>
                    <span className="text-[10px] text-stone-600 shrink-0">
                      {timeLabel(conv.lastActiveAt)}
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 truncate mt-0.5">
                    {conv.session.messages.filter(m => m.role === 'assistant').at(-1)?.content.slice(0, 50) ?? ''}
                  </p>
                </button>
              ))}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <p className="px-4 py-6 text-xs text-stone-600 text-center">
            {search ? 'Sin resultados' : 'Aún no hay conversaciones'}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-stone-700 shrink-0">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-stone-700 text-stone-400 text-sm hover:bg-stone-700/50 hover:text-stone-200 transition-colors"
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
