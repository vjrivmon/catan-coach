'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { CoachAnalyzeModal } from './coach/CoachAnalyzeModal'
import { CameraOverlay } from './coach/CameraOverlay'
import { BoardOverlay } from './coach/BoardOverlay'
import { ResourceStepperBubble } from './coach/ResourceStepperBubble'
import { MessageBubble } from './MessageBubble'
import { SuggestionChips } from './SuggestionChips'
import { VoiceInput } from './VoiceInput'
import { TypingIndicator } from './TypingIndicator'
import { Sidebar } from './Sidebar'
import type { Message, Session, UserLevel, Conversation } from '@/src/domain/entities'
import { createEmptySession } from '@/src/domain/entities'
import { LevelDetector } from '@/src/domain/services/LevelDetector'
import { ConceptTracker } from '@/src/domain/services/ConceptTracker'

// ── Storage keys ──────────────────────────────────────────
const SESSION_KEY   = 'catan-coach-session'    // sesión activa (localStorage)
const HISTORY_KEY   = 'catan-coach-history'    // lista de conversaciones (localStorage)
const TAB_ALIVE_KEY = 'catan-coach-tab'        // flag de pestaña viva (sessionStorage)

const levelDetector  = new LevelDetector()
const conceptTracker = new ConceptTracker()

// ── Helpers ───────────────────────────────────────────────
function loadHistory(): Conversation[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] }
}

function saveHistory(history: Conversation[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
}

function saveCurrentSession(session: Session) {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

function loadCurrentSession(): Session | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function buildWelcomeMessage(isReturn: boolean, seenConcepts: string[]): Message {
  const suggestions = ['¿Cómo se prepara el tablero?', '¿Cuáles son los recursos del juego?', '¿Cuál es la mejor colocación inicial?']
  return {
    id: `welcome-${Date.now()}`,
    role: 'assistant',
    content: isReturn && seenConcepts.length > 0
      ? `Bienvenido de nuevo. La última vez estuvimos viendo: ${seenConcepts.slice(-3).join(', ')}. ¿Seguimos por ahí o tienes alguna duda nueva?`
      : 'Bienvenido a Catan Coach. Soy tu asistente para aprender y mejorar en Catan. Puedes preguntarme sobre las reglas del juego, estrategias para ganar, o cualquier duda que tengas. ¿Por dónde empezamos?',
    timestamp: Date.now(),
    suggestedQuestions: suggestions,
  }
}

function titleFromSession(session: Session): string {
  const first = session.messages.find(m => m.role === 'user')
  if (!first) return 'Conversación'
  return first.content.length > 36 ? first.content.slice(0, 36) + '…' : first.content
}

// ── Component ─────────────────────────────────────────────
export function ChatInterface({ backHref }: { backHref?: string } = {}) {
  const [session, setSession]             = useState<Session>(createEmptySession)
  const [activeConvId, setActiveConvId]   = useState<string>('')
  const [history, setHistory]             = useState<Conversation[]>([])
  const [sidebarOpen, setSidebarOpen]     = useState(false)
  const [input, setInput]                 = useState('')
  // Coach mode state
  const [coachMode, setCoachMode]               = useState(false)
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false)
  const [showCamera, setShowCamera]             = useState(false)
  const [showBoard, setShowBoard]               = useState(false)
  const [coachStep, setCoachStep]               = useState<null | 'waiting-resources'>(null)
  // Persisted board pieces across opens — only reset on "nueva conversación"
  const [savedPieces, setSavedPieces]           = useState<Record<string, {type:'settlement'|'city'|'road';color:string}>>({})
  const boardConfigured                         = Object.keys(savedPieces).length > 0
  const [isLoading, setIsLoading]         = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [lastSuggestions, setLastSuggestions]   = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLTextAreaElement>(null)

  // Auto-resize del textarea al escribir
  const autoResize = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  // ── Mount: detectar hard refresh vs recarga normal ────────
  useEffect(() => {
    const loadedHistory = loadHistory()
    setHistory(loadedHistory)

    const tabAlive = sessionStorage.getItem(TAB_ALIVE_KEY)
    sessionStorage.setItem(TAB_ALIVE_KEY, '1')

    if (!tabAlive) {
      // Hard refresh o nueva pestaña → empezar desde cero
      const freshSession = createEmptySession()
      const welcome = buildWelcomeMessage(false, [])
      freshSession.messages = [welcome]
      setSession(freshSession)
      setLastSuggestions(welcome.suggestedQuestions!)
      setActiveConvId('')
      saveCurrentSession(freshSession)
    } else {
      // Recarga normal → restaurar sesión activa
      const saved = loadCurrentSession()
      if (saved && saved.messages.length > 0) {
        setSession(saved)
        const seenConcepts = conceptTracker.getSeenConcepts(saved.conceptMap)
        const welcome = buildWelcomeMessage(true, seenConcepts)
        setSession(s => ({ ...s, messages: [...s.messages, welcome] }))
        setLastSuggestions(welcome.suggestedQuestions!)
      } else {
        const freshSession = createEmptySession()
        const welcome = buildWelcomeMessage(false, [])
        freshSession.messages = [welcome]
        setSession(freshSession)
        setLastSuggestions(welcome.suggestedQuestions!)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Auto-scroll ───────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.messages, streamingContent])

  // ── Reset altura textarea al vaciar input ─────────────────
  useEffect(() => {
    if (!input && inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
  }, [input])

  // ── Guardar conversación activa en historial ──────────────
  const persistToHistory = useCallback((updatedSession: Session, convId: string) => {
    const userMsgs = updatedSession.messages.filter(m => m.role === 'user')
    if (userMsgs.length === 0) return  // no guardamos si no hay mensajes del usuario

    const title = titleFromSession(updatedSession)
    const now = Date.now()

    setHistory(prev => {
      const existing = prev.find(c => c.id === convId)
      let next: Conversation[]
      if (existing) {
        next = prev.map(c => c.id === convId
          ? { ...c, title, session: updatedSession, lastActiveAt: now }
          : c
        )
      } else {
        const newConv: Conversation = { id: convId, title, session: updatedSession, createdAt: now, lastActiveAt: now }
        next = [newConv, ...prev]
      }
      saveHistory(next)
      return next
    })
  }, [])

  // ── Nueva conversación ────────────────────────────────────
  const startNewConversation = useCallback(() => {
    const freshSession = createEmptySession()
    const welcome = buildWelcomeMessage(false, [])
    freshSession.messages = [welcome]
    const newId = `conv-${Date.now()}`
    setSession(freshSession)
    setActiveConvId(newId)
    setLastSuggestions(welcome.suggestedQuestions!)
    setInput('')
    saveCurrentSession(freshSession)
    setSidebarOpen(false)
    // Reset coach state completely
    setSavedPieces({})
    setCoachMode(false)
    setCoachStep(null)
    setShowAnalyzeModal(false)
    setShowBoard(false)
    setShowCamera(false)
  }, [])

  // ── Cargar conversación del historial ─────────────────────
  const loadConversation = useCallback((conv: Conversation) => {
    setSession(conv.session)
    setActiveConvId(conv.id)
    setLastSuggestions([])
    setInput('')
    saveCurrentSession(conv.session)
    setSidebarOpen(false)
  }, [])

  // ── Enviar mensaje ────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const convId = activeConvId || `conv-${Date.now()}`
    if (!activeConvId) setActiveConvId(convId)

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    }

    const updatedLevel: UserLevel = levelDetector.detect([...session.messages, userMessage])
    const seenConcepts = conceptTracker.getSeenConcepts(session.conceptMap)

    setSession(s => ({ ...s, messages: [...s.messages, userMessage], userLevel: updatedLevel, lastActiveAt: Date.now() }))
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
            if (event.type === 'token') { fullResponse += event.token; setStreamingContent(fullResponse) }
            else if (event.type === 'done') { suggestions = event.suggestedQuestions || []; agentUsed = event.agentUsed || 'direct' }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      fullResponse = 'Lo siento, no puedo conectar con el asistente ahora mismo. Asegúrate de que Ollama y ChromaDB están en funcionamiento.'
      console.error(err)
    }

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
    if (progressionMsg) newMessages.push({ id: `progress-${Date.now()}`, role: 'assistant', content: progressionMsg, timestamp: Date.now() + 1 })

    setSession(s => {
      const updated = { ...s, messages: [...s.messages, ...newMessages], conceptMap: updatedConceptMap, userLevel: updatedLevel, lastActiveAt: Date.now() }
      saveCurrentSession(updated)
      persistToHistory(updated, convId)
      return updated
    })

    setLastSuggestions(suggestions)
    setStreamingContent('')
    setIsLoading(false)
  }, [session, isLoading, activeConvId, persistToHistory])

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input) }
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-dvh bg-stone-900">

      {/* Header */}
      <header className="bg-stone-800 border-b border-stone-700 px-4 py-3 flex items-center gap-3 shrink-0 min-h-[56px]">
        {/* Back link or Hamburger */}
        {backHref ? (
          <Link
            href={backHref}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-stone-700 transition-colors shrink-0"
            aria-label="Volver"
          >
            <svg className="w-5 h-5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
        ) : (
        <button
          onClick={() => setSidebarOpen(o => !o)}
          aria-label={sidebarOpen ? 'Cerrar historial' : 'Abrir historial'}
          className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-stone-700 transition-colors shrink-0"
        >
          {sidebarOpen ? (
            <svg className="w-5 h-5 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
        )}

        <div className="w-9 h-9 rounded-full bg-amber-700 flex items-center justify-center shrink-0 overflow-hidden">
          <img
            src="/logo.png"
            alt=""
            className="w-9 h-9 rounded-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
        <div className="flex flex-col justify-center flex-1">
          <h1 className="text-amber-400 font-semibold text-base leading-tight">Catan Coach</h1>
          <p className="text-stone-400 text-xs leading-tight">
            {coachMode ? 'Modo Coach en partida' : 'Tu asistente de Catán'}
          </p>
        </div>

        {/* Hexagon coach button — always visible, behaviour depends on state */}
        <button
          onClick={() => {
            setCoachMode(true)
            if (boardConfigured) {
              setShowBoard(true)       // board exists → reopen to update
            } else {
              setShowAnalyzeModal(true) // first time → show 2-option modal
            }
          }}
          title="Coach en partida"
          className={`relative flex items-center justify-center w-9 h-9 rounded-xl border transition-colors shrink-0 ${
            coachMode
              ? 'border-amber-500 bg-amber-900/30'
              : 'border-stone-600 bg-stone-700 hover:border-amber-600 hover:bg-amber-900/20'
          }`}
        >
          <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L21.196 7V17L12 22L2.804 17V7L12 2Z" stroke="#f59e0b" strokeWidth="1.8" strokeLinejoin="round"/>
            <path d="M12 7L17 9.8V15.2L12 18L7 15.2V9.8L12 7Z" fill="rgba(245,158,11,0.25)" stroke="#f59e0b" strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
          {/* Dot: amber = no board yet, green = board active */}
          <div className={`absolute top-[-2px] right-[-2px] w-2 h-2 rounded-full border border-stone-800 ${
            boardConfigured ? 'bg-green-400' : 'bg-amber-400'
          }`} />
        </button>
      </header>

      {/* Body: sidebar + chat */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar: panel lateral (split-screen) con backdrop en móvil, inline en desktop */}
        {sidebarOpen && (
          <>
            {/* Backdrop — cubre el chat de fondo, click cierra */}
            <div
              className="absolute inset-0 z-10 sm:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            {/* Panel */}
            <div className="absolute left-0 top-0 bottom-0 z-20 w-72 sm:relative sm:inset-auto sm:z-auto sm:w-60 sm:shrink-0">
              <Sidebar
                conversations={history}
                activeId={activeConvId}
                onSelect={loadConversation}
                onNew={startNewConversation}
                onClose={() => setSidebarOpen(false)}
              />
            </div>
          </>
        )}

        {/* Chat area */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {session.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {isLoading && (
              streamingContent
                ? <MessageBubble message={{ id: 'streaming', role: 'assistant', content: streamingContent, timestamp: Date.now() }} isStreaming />
                : <TypingIndicator />
            )}

            {!isLoading && lastSuggestions.length > 0 && coachStep === null && (
              <SuggestionChips suggestions={lastSuggestions} onSelect={sendMessage} />
            )}

            {/* ── Coach: resource stepper ── */}
            {coachStep === 'waiting-resources' && !isLoading && (
              <ResourceStepperBubble
                onConfirm={async (counts) => {
                  setCoachStep(null)
                  const total = Object.values(counts).reduce((a, b) => a + b, 0)
                  const lines = [
                    counts.wood    > 0 ? `Madera: ${counts.wood}`   : '',
                    counts.clay    > 0 ? `Arcilla: ${counts.clay}`  : '',
                    counts.cereal  > 0 ? `Trigo: ${counts.cereal}`  : '',
                    counts.wool    > 0 ? `Oveja: ${counts.wool}`    : '',
                    counts.mineral > 0 ? `Mineral: ${counts.mineral}` : '',
                  ].filter(Boolean).join(' · ')

                  const userMsg: import('@/src/domain/entities').Message = {
                    id: `res-${Date.now()}`, role: 'user',
                    content: `Recursos: ${lines || 'ninguno'}`,
                    timestamp: Date.now(),
                  }
                  setSession(s => ({ ...s, messages: [...s.messages, userMsg] }))
                  setIsLoading(true)
                  await new Promise(r => setTimeout(r, 1000))

                  // Recommendation based on resources
                  let rec = ''
                  if (counts.wood >= 1 && counts.clay >= 1) rec = '🛤️ **Construye un camino** hacia la zona de puertos del norte — tienes los recursos para expandirte.'
                  else if (counts.cereal >= 2 && counts.mineral >= 3) rec = '🏙️ **Mejora tu pueblo a ciudad** en el hex 11 (cereal) — máxima producción con tu stock actual.'
                  else if (counts.wood >= 1 && counts.clay >= 1 && counts.cereal >= 1 && counts.wool >= 1) rec = '🏠 **Construye un pueblo** en el vértice entre cereal(11) y mineral(8) — intersección óptima según el GeneticAgent.'
                  else rec = `Con ${total} recurso${total !== 1 ? 's' : ''} conviene esperar al siguiente turno y acumular antes de construir.`

                  const botMsg: import('@/src/domain/entities').Message = {
                    id: `rec-${Date.now()}`, role: 'assistant',
                    content: rec,
                    timestamp: Date.now(),
                  }
                  setSession(s => ({ ...s, messages: [...s.messages, botMsg] }))
                  setIsLoading(false)
                }}
              />
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="shrink-0 bg-stone-800 border-t border-stone-700 px-4 py-3">
            <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
              <div className="flex items-center gap-2 bg-stone-700 rounded-xl px-3 py-2 focus-within:ring-1 focus-within:ring-amber-600">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => { setInput(e.target.value); autoResize() }}
                  onKeyDown={handleKeyDown}
                  placeholder="Pregunta sobre Catan..."
                  rows={1}
                  disabled={isLoading}
                  className="flex-1 bg-transparent text-stone-100 placeholder-stone-400 resize-none focus:outline-none disabled:opacity-50 text-sm leading-relaxed py-1 overflow-hidden"
                />
                <VoiceInput onTranscript={text => { setInput(prev => prev + text); setTimeout(autoResize, 0) }} disabled={isLoading} />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg p-2 transition-colors shrink-0"
                  aria-label="Enviar"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>
            </form>
          </div>

        </div>
      </div>

      {/* ── Coach overlays ── */}
      {showAnalyzeModal && (
        <CoachAnalyzeModal
          onClose={() => { setShowAnalyzeModal(false); setCoachMode(false); }}
          onPhoto={() => { setShowAnalyzeModal(false); setShowCamera(true); }}
          onBoard={() => { setShowAnalyzeModal(false); setShowBoard(true); }}
        />
      )}

      {showCamera && (
        <CameraOverlay
          onClose={() => { setShowCamera(false); setShowAnalyzeModal(true); }}
          onCapture={async (file) => {
            setShowCamera(false)
            // Add user message showing photo was sent
            const photoMsg: import('@/src/domain/entities').Message = {
              id: `photo-${Date.now()}`, role: 'user',
              content: '📷 Foto del tablero enviada',
              timestamp: Date.now(),
            }
            setSession(s => ({ ...s, messages: [...s.messages, photoMsg] }))
            // Simulate analysis response
            setIsLoading(true)
            await new Promise(r => setTimeout(r, 1200))
            const analysisMsg: import('@/src/domain/entities').Message = {
              id: `analysis-${Date.now()}`, role: 'assistant',
              content: '✅ He detectado el tablero. ¿Cuántos recursos tienes ahora?',
              timestamp: Date.now(),
            }
            setSession(s => ({ ...s, messages: [...s.messages, analysisMsg] }))
            setIsLoading(false)
            setCoachStep('waiting-resources')
          }}
        />
      )}

      {showBoard && (
        <BoardOverlay
          initialPieces={savedPieces}
          onClose={() => {
            setShowBoard(false)
            // If board was already configured, just close — don't re-trigger the modal
            if (!boardConfigured) setShowAnalyzeModal(true)
          }}
          onConfirm={(pieces) => {
            setShowBoard(false)
            setSavedPieces(pieces)   // persist for future opens
            const count = Object.keys(pieces).length
            const isUpdate = boardConfigured
            const boardMsg: import('@/src/domain/entities').Message = {
              id: `board-${Date.now()}`, role: 'user',
              content: isUpdate
                ? `🗺️ Tablero actualizado (${count} piezas)`
                : `🗺️ Tablero configurado (${count > 0 ? count + ' piezas' : 'vacío'})`,
              timestamp: Date.now(),
            }
            const replyMsg: import('@/src/domain/entities').Message = {
              id: `board-reply-${Date.now()}`, role: 'assistant',
              content: isUpdate
                ? '✅ Tablero actualizado. ¿Cuántos recursos tienes ahora?'
                : 'Tablero recibido. ¿Cuántos recursos tienes ahora?',
              timestamp: Date.now(),
            }
            setSession(s => ({ ...s, messages: [...s.messages, boardMsg, replyMsg] }))
            setCoachStep('waiting-resources')
          }}
        />
      )}

    </div>
  )
}
