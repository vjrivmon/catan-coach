'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageBubble } from './MessageBubble'
import { SuggestionChips } from './SuggestionChips'
import { VoiceInput } from './VoiceInput'
import { TypingIndicator } from './TypingIndicator'
import type { Message, Session, UserLevel } from '@/src/domain/entities'
import { createEmptySession, CATAN_CONCEPTS } from '@/src/domain/entities'
import { LevelDetector } from '@/src/domain/services/LevelDetector'
import { ConceptTracker } from '@/src/domain/services/ConceptTracker'

const SESSION_KEY = 'catan-coach-session'
const levelDetector = new LevelDetector()
const conceptTracker = new ConceptTracker()

function loadSession(): Session | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveSession(session: Session) {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function ChatInterface() {
  const [session, setSession] = useState<Session>(createEmptySession)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [lastSuggestions, setLastSuggestions] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load session from localStorage on mount
  useEffect(() => {
    const saved = loadSession()
    if (saved && saved.messages.length > 0) {
      setSession(saved)

      // Greet with context
      const seenConcepts = conceptTracker.getSeenConcepts(saved.conceptMap)
      const greeting: Message = {
        id: `welcome-back-${Date.now()}`,
        role: 'assistant',
        content: seenConcepts.length > 0
          ? `Bienvenido de nuevo. La última vez estuvimos viendo: ${seenConcepts.slice(-3).join(', ')}. ¿Seguimos por ahí o tienes alguna duda nueva?`
          : 'Bienvenido de nuevo a Catan Coach. ¿En qué puedo ayudarte hoy?',
        timestamp: Date.now(),
      }
      setSession(s => ({ ...s, messages: [...s.messages, greeting] }))
    } else {
      // First visit greeting
      const greeting: Message = {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: 'Bienvenido a Catan Coach. Soy tu asistente para aprender y mejorar en Catan. Puedes preguntarme sobre las reglas del juego, estrategias para ganar, o cualquier duda que tengas. ¿Por dónde empezamos?',
        timestamp: Date.now(),
        suggestedQuestions: [
          '¿Cómo se prepara el tablero?',
          '¿Cuáles son los recursos del juego?',
          '¿Cuál es la mejor colocación inicial?',
        ],
      }
      const initial = createEmptySession()
      initial.messages = [greeting]
      setSession(initial)
      setLastSuggestions(greeting.suggestedQuestions!)
    }
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.messages, streamingContent])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    }

    const updatedLevel: UserLevel = levelDetector.detect([...session.messages, userMessage])
    const seenConcepts = conceptTracker.getSeenConcepts(session.conceptMap)

    setSession(s => ({
      ...s,
      messages: [...s.messages, userMessage],
      userLevel: updatedLevel,
      lastActiveAt: Date.now(),
    }))
    setInput('')
    setIsLoading(true)
    setStreamingContent('')
    setLastSuggestions([])

    let fullResponse = ''
    let suggestions: string[] = []
    let agentUsed: string = 'direct'

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          history: session.messages.slice(-10),
          userLevel: updatedLevel,
          seenConcepts,
        }),
      })

      if (!response.ok || !response.body) throw new Error('Error de conexión')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const lines = decoder.decode(value, { stream: true }).split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'token') {
              fullResponse += event.token
              setStreamingContent(fullResponse)
            } else if (event.type === 'done') {
              suggestions = event.suggestedQuestions || []
              agentUsed = event.agentUsed || 'direct'
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      fullResponse = 'Lo siento, no puedo conectar con el asistente ahora mismo. Asegúrate de que Ollama y ChromaDB están en funcionamiento.'
      console.error(err)
    }

    // Extract concepts and check for progression message
    const newConcepts = conceptTracker.extract(fullResponse)
    const updatedConceptMap = conceptTracker.update(session.conceptMap, newConcepts)
    const progressionMsg = conceptTracker.getProgressionMessage(updatedConceptMap, newConcepts)

    const assistantMessage: Message = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: fullResponse,
      timestamp: Date.now(),
      agentUsed: agentUsed as Message['agentUsed'],
      suggestedQuestions: suggestions,
    }

    const newMessages: Message[] = [assistantMessage]

    // Add progression message if milestone reached
    if (progressionMsg) {
      newMessages.push({
        id: `progress-${Date.now()}`,
        role: 'assistant',
        content: progressionMsg,
        timestamp: Date.now() + 1,
      })
    }

    setSession(s => {
      const updated = {
        ...s,
        messages: [...s.messages, ...newMessages],
        conceptMap: updatedConceptMap,
        userLevel: updatedLevel,
        lastActiveAt: Date.now(),
      }
      saveSession(updated)
      return updated
    })

    setLastSuggestions(suggestions)
    setStreamingContent('')
    setIsLoading(false)
  }, [session, isLoading])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex flex-col h-dvh bg-stone-900">
      {/* Header */}
      <header className="bg-stone-800 border-b border-stone-700 px-4 py-3 flex items-center gap-3 shrink-0">
        <img
          src="/logo.jpg"
          alt="Catan Coach"
          className="w-10 h-10 rounded-xl object-cover object-center shrink-0"
        />
        <div>
          <h1 className="text-amber-400 font-semibold text-base leading-tight">Catan Coach</h1>
          <p className="text-stone-400 text-xs">Tu asistente de Catan</p>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {session.messages.map((msg, i) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming message */}
        {isLoading && (
          streamingContent
            ? <MessageBubble
                message={{
                  id: 'streaming',
                  role: 'assistant',
                  content: streamingContent,
                  timestamp: Date.now(),
                }}
                isStreaming
              />
            : <TypingIndicator />
        )}

        {/* Suggestion chips (under last assistant message) */}
        {!isLoading && lastSuggestions.length > 0 && (
          <SuggestionChips
            suggestions={lastSuggestions}
            onSelect={(q) => sendMessage(q)}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 bg-stone-800 border-t border-stone-700 px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-end gap-2 max-w-2xl mx-auto">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pregunta sobre Catan..."
              rows={1}
              disabled={isLoading}
              className="w-full bg-stone-700 text-stone-100 placeholder-stone-400 rounded-xl px-4 py-3 pr-12 resize-none focus:outline-none focus:ring-1 focus:ring-amber-600 disabled:opacity-50 text-sm leading-relaxed"
              style={{ maxHeight: '120px', overflowY: 'auto' }}
            />
          </div>
          <VoiceInput onTranscript={text => setInput(prev => prev + text)} disabled={isLoading} />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl p-3 transition-colors shrink-0"
            aria-label="Enviar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
