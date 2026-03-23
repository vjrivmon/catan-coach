'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { CoachAnalyzeModal } from './coach/CoachAnalyzeModal'
import { CameraOverlay } from './coach/CameraOverlay'
import { BoardOverlay, type BoardConfirmPayload } from './coach/BoardOverlay'
import { ResourceStepperBubble } from './coach/ResourceStepperBubble'
import { DiceInputBubble } from './coach/DiceInputBubble'
import { DevCardStepper } from './coach/DevCardStepper'
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
  // Mode state
  // hasSelectedMode: user has chosen one of the 3 options (text-only, scan, board)
  // coachMode: true = has board context; false = text-only (rules/strategy Q&A)
  const [hasSelectedMode, setHasSelectedMode]   = useState(false)
  const [coachMode, setCoachMode]               = useState(false)
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false)
  const [showCamera, setShowCamera]             = useState(false)
  const [showBoard, setShowBoard]               = useState(false)
  const [coachStep, setCoachStep]               = useState<null | 'waiting-resources' | 'waiting-devCards' | 'waiting-dice'>(null)
  // Punto 3 — game state
  const [gameStarted, setGameStarted]           = useState(false)
  const [currentTurn, setCurrentTurn]           = useState(1)
  const [diceMode, setDiceMode]                 = useState<'manual' | 'auto'>('manual')
  const [savedDevCards, setSavedDevCards]       = useState<Record<string,number> | null>(null)
  // Persisted board state across opens — only reset on "nueva conversación"
  const [savedPieces, setSavedPieces]           = useState<Record<string, {type:'settlement'|'city'|'road';color:string}>>({})
  const [savedMyColor, setSavedMyColor]         = useState<string>('red')
  const [savedAssignments, setSavedAssignments] = useState<string[]>([])
  const [savedResources, setSavedResources]     = useState<Record<string,number> | null>(null)
  const [savedRobberHex, setSavedRobberHex]     = useState<number>(9)  // 9 = desert default
  const boardConfigured                         = Object.keys(savedPieces).length > 0

  // Terrain + number data mirrors BoardOverlay constants — needed to enrich board summary
  const TERRAIN_ORDER_CI = [
    'mineral','wool','wood',
    'cereal','clay','wool','clay',
    'clay','cereal','desert','wood','mineral',
    'wood','mineral','cereal','wool',
    'cereal','wood','wool',
  ] as const
  const NUMBERS_CI = [10,2,9, 12,6,4,10, 9,11,0,3,8, 8,3,4,5, 5,6,11]

  // Geometry mirrors BoardOverlay for vertex → hex mapping
  const R_CI = 40
  const W_CI = Math.sqrt(3) * R_CI
  const ROW_H_CI = 1.5 * R_CI
  const ROWS_CI = [
    { n: 3, colStart: 1 }, { n: 4, colStart: 0.5 }, { n: 5, colStart: 0 },
    { n: 4, colStart: 0.5 }, { n: 3, colStart: 1 },
  ]
  const SVG_W_CI = 390; const PAD_TOP_CI = 50
  const X0_CI = (SVG_W_CI - 5 * W_CI) / 2 + W_CI / 2
  const HEX_CENTERS_CI: [number, number][] = []
  for (let r = 0; r < ROWS_CI.length; r++) {
    for (let c = 0; c < ROWS_CI[r].n; c++) {
      const cx = X0_CI + (ROWS_CI[r].colStart + c) * W_CI
      const cy = PAD_TOP_CI + r * ROW_H_CI
      HEX_CENTERS_CI.push([cx, cy])
    }
  }
  const ANGLES_CI = [30,90,150,210,270,330].map(d => (d * Math.PI) / 180)
  function hexVerticesCI(cx: number, cy: number): [number, number][] {
    return ANGLES_CI.map(a => [cx + R_CI * Math.cos(a), cy + R_CI * Math.sin(a)] as [number, number])
  }
  function approxKeyCI(x: number, y: number) { return `${Math.round(x)},${Math.round(y)}` }

  /** Build full board context string for the LLM */
  const buildBoardSummary = useCallback((): string => {
    if (Object.keys(savedPieces).length === 0) return 'Tablero vacío'

    const colorNames: Record<string,string> = { red:'Rojo', blue:'Azul', orange:'Naranja', white:'Blanco' }
    const terrainNames: Record<string,string> = {
      clay:'arcilla', mineral:'mineral', wood:'madera', cereal:'trigo', wool:'oveja', desert:'desierto'
    }
    const myLabel = colorNames[savedMyColor] ?? savedMyColor

    // Build vertex → hex index map
    const vertToHexes = new Map<string, number[]>()
    HEX_CENTERS_CI.forEach(([cx, cy], hi) => {
      for (const [vx, vy] of hexVerticesCI(cx, cy)) {
        const k = approxKeyCI(vx, vy)
        if (!vertToHexes.has(k)) vertToHexes.set(k, [])
        vertToHexes.get(k)!.push(hi)
      }
    })

    // Build edge → hex index map (midpoint key)
    const edgeToHexes = new Map<string, number[]>()
    HEX_CENTERS_CI.forEach(([cx, cy], hi) => {
      const verts = hexVerticesCI(cx, cy)
      for (let i = 0; i < 6; i++) {
        const [x1, y1] = verts[i]; const [x2, y2] = verts[(i+1)%6]
        const k = approxKeyCI((x1+x2)/2, (y1+y2)/2)
        if (!edgeToHexes.has(k)) edgeToHexes.set(k, [])
        edgeToHexes.get(k)!.push(hi)
      }
    })

    // Group pieces by color
    const byColor: Record<string, { settlements: string[], cities: string[], roads: string[] }> = {}
    for (const [key, piece] of Object.entries(savedPieces)) {
      const c = piece.color
      if (!byColor[c]) byColor[c] = { settlements: [], cities: [], roads: [] }

      // Resolve which hexes this piece touches
      let hexIndices: number[] = []
      if (key.startsWith('v')) {
        const id = parseInt(key.slice(1))
        // Find vertex by id via rebuild (simplified: use key from DOM — we store approxKey)
        // Since we can't easily map id→coords without full graph rebuild, use hex centers approximation
        // Instead, find the vertex key from saved pieces context — we store by approxKey in the overlay
        hexIndices = [] // will be enriched below via alternative lookup
      } else if (key.startsWith('e')) {
        hexIndices = edgeToHexes.get(key) ?? []
      }

      const terrainDesc = hexIndices
        .filter(hi => TERRAIN_ORDER_CI[hi] !== 'desert')
        .map(hi => {
          const t = terrainNames[TERRAIN_ORDER_CI[hi]] ?? TERRAIN_ORDER_CI[hi]
          const n = NUMBERS_CI[hi]
          return n > 0 ? `${t}(${n})` : t
        }).join('+') || 'posición'

      if (piece.type === 'settlement') byColor[c].settlements.push(terrainDesc)
      else if (piece.type === 'city')  byColor[c].cities.push(terrainDesc)
      else if (piece.type === 'road')  byColor[c].roads.push(terrainDesc)
    }

    const playerLines: string[] = []
    const playerOrder = savedAssignments.length > 0
      ? savedAssignments
      : Object.keys(byColor)

    for (const color of playerOrder) {
      const s = byColor[color]
      if (!s) continue
      const label = colorNames[color] ?? color
      const isMe = color === savedMyColor
      const parts: string[] = []
      if (s.settlements.length > 0) parts.push(`${s.settlements.length} poblado${s.settlements.length>1?'s':''} (${s.settlements.join(', ')})`)
      if (s.cities.length > 0)      parts.push(`${s.cities.length} ciudad${s.cities.length>1?'es':''} (${s.cities.join(', ')})`)
      if (s.roads.length > 0)       parts.push(`${s.roads.length} camino${s.roads.length>1?'s':''}`)
      if (parts.length > 0) playerLines.push(`${isMe ? `TU COLOR (${label})` : label}: ${parts.join(', ')}`)
    }

    const resourceLine = savedResources
      ? Object.entries(savedResources)
          .filter(([,v]) => v > 0)
          .map(([k,v]) => `${terrainNames[k]||k}×${v}`)
          .join(', ')
      : null

    let summary = `TABLERO ACTUAL:\n${playerLines.join('\n') || 'Sin piezas colocadas'}`
    if (resourceLine) summary += `\n\nRECURSOS DE ${myLabel.toUpperCase()}: ${resourceLine}`
    if (savedRobberHex !== 9) {
      const rTerrain = TERRAIN_ORDER_CI[savedRobberHex] ?? 'desconocido'
      const rNum = NUMBERS_CI[savedRobberHex] ?? 0
      summary += `\n\nLADRON: en hex de ${terrainNames[rTerrain] ?? rTerrain}${rNum > 0 ? `(${rNum})` : ''} — bloquea producción de ese hex`
    }

    return summary
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPieces, savedMyColor, savedAssignments, savedResources])
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
    // Reset all mode + coach + game state
    setHasSelectedMode(false)
    setCoachMode(false)
    setSavedPieces({})
    setSavedMyColor('red')
    setSavedAssignments([])
    setSavedResources(null)
    setSavedRobberHex(9)
    setSavedDevCards(null)
    setCoachStep(null)
    setGameStarted(false)
    setCurrentTurn(1)
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
  const sendMessage = useCallback(async (
    text: string,
    coachStateOverride?: { boardSummary: string; resources: Record<string,number> | null }
  ) => {
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

    // Build coachState: prefer explicit override, then derive from saved state
    const baseCoachState = boardConfigured ? {
      boardSummary: buildBoardSummary(),
      resources: savedResources,
      ...(gameStarted ? {
        turn: currentTurn,
        devCards: savedDevCards,
      } : {}),
    } : undefined
    const activeCoachState = coachMode
      ? (coachStateOverride ?? baseCoachState)
      : undefined

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
          mode: coachMode ? 'coach' : 'aprende',
          ...(activeCoachState ? { coachState: activeCoachState } : {}),
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
        <div className="flex flex-col justify-center flex-1 min-w-0">
          <h1 className="text-amber-400 font-semibold text-base leading-tight">Catan Coach</h1>
          <p className="text-stone-400 text-xs leading-tight truncate">
            {boardConfigured ? 'Coach en partida' : 'Asistente de Catan'}
          </p>
        </div>

        {/* Hex icon — always visible: opens board if active, shows 3 options otherwise */}
        <button
          onClick={() => {
            if (boardConfigured) setShowBoard(true)
            else setShowAnalyzeModal(true)
          }}
          title={boardConfigured ? 'Ver tablero' : 'Opciones de partida'}
          className="relative flex items-center justify-center w-9 h-9 rounded-xl shrink-0 bg-stone-900/60 border border-stone-700 hover:border-amber-600 transition-colors text-stone-400 hover:text-amber-400"
        >
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L21.196 7V17L12 22L2.804 17V7L12 2Z"
              stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
            <path d="M12 7L17 9.8V15.2L12 18L7 15.2V9.8L12 7Z"
              fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
          {boardConfigured && (
            <div className="absolute top-0 right-0 w-2 h-2 bg-green-400 rounded-full border border-stone-800" />
          )}
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

          {/* ── Board overlay — fills chat area, header stays visible ── */}
          {showBoard && (
            <BoardOverlay
              initialPieces={savedPieces}
              initialMyColor={savedMyColor}
              initialAssignments={savedAssignments}
              onClose={() => { setShowBoard(false) }}
              onConfirm={({ pieces, myColor, assignments, robberHex }) => {
                setShowBoard(false)
                setSavedPieces(pieces)
                setSavedMyColor(myColor)
                setSavedAssignments(assignments)
                setSavedRobberHex(robberHex)
                const count = Object.keys(pieces).length
                const isUpdate = boardConfigured
                const colorNames: Record<string,string> = { red:'Rojo', blue:'Azul', orange:'Naranja', white:'Blanco' }
                const boardMsg: import('@/src/domain/entities').Message = {
                  id: `board-${Date.now()}`, role: 'user',
                  content: isUpdate
                    ? `Tablero actualizado — color ${colorNames[myColor]??myColor}, ${count} piezas`
                    : `Tablero configurado — color ${colorNames[myColor]??myColor}${count > 0 ? `, ${count} piezas` : ', sin piezas aún'}`,
                  timestamp: Date.now(),
                }
                const replyMsg: import('@/src/domain/entities').Message = {
                  id: `board-reply-${Date.now()}`, role: 'assistant',
                  content: isUpdate
                    ? 'Tablero actualizado. Indica tus recursos para recibir una recomendación ajustada.'
                    : 'Tablero recibido. Indica tus recursos para que pueda darte una recomendación real.',
                  timestamp: Date.now(),
                }
                setSession(s => ({ ...s, messages: [...s.messages, boardMsg, replyMsg] }))
                setCoachStep('waiting-resources')
              }}
            />
          )}

          {!showBoard && <>
          {/* ── Mode selection — shown before user picks an option ── */}
          {!hasSelectedMode && (
            <div className="flex-1 flex flex-col justify-end pb-6 px-4">
              <div className="max-w-lg mx-auto w-full flex flex-col gap-4">
                <div className="text-center mb-2">
                  <p className="text-stone-100 font-bold text-lg">¿Cómo quieres empezar?</p>
                  <p className="text-stone-400 text-sm mt-1">Elige según tu situación</p>
                </div>

                {/* Escanear tablero */}
                <button
                  onClick={() => { setHasSelectedMode(true); setCoachMode(true); setShowCamera(true) }}
                  className="flex items-center gap-4 bg-stone-800 hover:bg-stone-750 border border-stone-700 hover:border-amber-600 rounded-2xl p-5 text-left transition-colors group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-amber-900/50 flex items-center justify-center shrink-0 group-hover:bg-amber-800/60 transition-colors">
                    <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                      <circle cx="12" cy="13" r="3"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-stone-100 font-semibold text-base">Escanear tablero</p>
                    <p className="text-stone-400 text-sm mt-0.5">Apunta la cámara y encuadra tu partida real</p>
                  </div>
                  <svg className="w-5 h-5 text-stone-500 group-hover:text-amber-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </button>

                {/* Tablero interactivo */}
                <button
                  onClick={() => { setHasSelectedMode(true); setCoachMode(true); setShowBoard(true) }}
                  className="flex items-center gap-4 bg-stone-800 hover:bg-stone-750 border border-stone-700 hover:border-amber-600 rounded-2xl p-5 text-left transition-colors group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-amber-900/50 flex items-center justify-center shrink-0 group-hover:bg-amber-800/60 transition-colors">
                    <svg className="w-7 h-7 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
                      <path d="M12 2L21.196 7V17L12 22L2.804 17V7L12 2Z"/>
                      <path fill="rgba(245,158,11,0.2)" d="M12 7L17 9.8V15.2L12 18L7 15.2V9.8L12 7Z"/>
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

                {/* Solo dudas */}
                <button
                  onClick={() => { setHasSelectedMode(true); setCoachMode(false) }}
                  className="flex items-center gap-4 bg-stone-800 hover:bg-stone-750 border border-stone-700 hover:border-amber-600 rounded-2xl p-5 text-left transition-colors group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-amber-900/50 flex items-center justify-center shrink-0 group-hover:bg-amber-800/60 transition-colors">
                    <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-stone-100 font-semibold text-base">Solo dudas</p>
                    <p className="text-stone-400 text-sm mt-0.5">Pregunta sobre reglas y estrategia sin tablero</p>
                  </div>
                  <svg className="w-5 h-5 text-stone-500 group-hover:text-amber-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Messages — only shown after mode is selected */}
          {hasSelectedMode && <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
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
                  setSavedResources(counts)   // persist for future turns

                  const resourceLabels: Record<string,string> = {
                    wood:'Madera', clay:'Arcilla', cereal:'Trigo', wool:'Oveja', mineral:'Mineral'
                  }
                  const lines = (Object.entries(counts) as [string,number][])
                    .filter(([,v]) => v > 0)
                    .map(([k,v]) => `${resourceLabels[k]||k}: ${v}`)
                    .join(' · ')

                  const userMsg: import('@/src/domain/entities').Message = {
                    id: `res-${Date.now()}`, role: 'user',
                    content: `Recursos confirmados: ${lines || 'ninguno'}`,
                    timestamp: Date.now(),
                  }
                  setSession(s => ({ ...s, messages: [...s.messages, userMsg] }))

                  // 1. Ask GeneticAgent first
                  let geneticRec = null
                  try {
                    const pieceKeys = Object.keys(savedPieces)
                    const settlements = pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === savedMyColor && savedPieces[k].type === 'settlement').map(k => parseInt(k.slice(1)))
                    const cities = pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === savedMyColor && savedPieces[k].type === 'city').map(k => parseInt(k.slice(1)))
                    const roads = pieceKeys.filter(k => k.startsWith('e') && savedPieces[k].color === savedMyColor).map(k => k.slice(1))
                    const apiRes = await fetch('/api/coach-recommend', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        resources: counts,
                        settlements, cities, roads,
                        vp: settlements.length + cities.length * 2,
                        roadLength: roads.length,
                        gamePhasePlaying: true,
                        robberHex: savedRobberHex,
                      }),
                    })
                    if (apiRes.ok) geneticRec = await apiRes.json()
                  } catch { /* GeneticAgent optional — LLM works without it */ }

                  // 2. Build coachState with fresh resources + genetic recommendation
                  const freshCoachState = {
                    boardSummary: buildBoardSummary(),
                    resources: counts,
                    geneticRecommendation: geneticRec,
                  }

                  // 3. Ask the LLM — it now has genetic recommendation as ground truth
                  await sendMessage(
                    '¿Cuál es la mejor jugada que puedo hacer con mis recursos actuales y el estado del tablero?',
                    freshCoachState,
                  )
                }}
              />
            )}

            {/* ── Punto 3: DevCard stepper ── */}
            {coachStep === 'waiting-devCards' && !isLoading && (
              <DevCardStepper
                onConfirm={(cards) => {
                  setCoachStep(null)
                  setSavedDevCards(cards)
                  const total = Object.values(cards).reduce((a,b) => a+b, 0)
                  const cardMsg: import('@/src/domain/entities').Message = {
                    id: `dev-${Date.now()}`, role: 'user',
                    content: total === 0 ? 'Sin cartas de desarrollo' : `Cartas: ${Object.entries(cards).filter(([,v])=>v>0).map(([k,v])=>`${k}×${v}`).join(', ')}`,
                    timestamp: Date.now(),
                  }
                  const replyMsg: import('@/src/domain/entities').Message = {
                    id: `dev-reply-${Date.now()}`, role: 'assistant',
                    content: `Partida iniciada. Turno ${currentTurn}. ¿Cuál es el resultado del dado?`,
                    timestamp: Date.now(),
                  }
                  setSession(s => ({ ...s, messages: [...s.messages, cardMsg, replyMsg] }))
                  setGameStarted(true)
                  setCoachStep('waiting-dice')
                }}
              />
            )}

            {/* ── Punto 3: Dice input ── */}
            {coachStep === 'waiting-dice' && !isLoading && (
              <DiceInputBubble
                mode={diceMode}
                onConfirm={async (value) => {
                  setCoachStep(null)
                  setCurrentTurn(t => t + 1)

                  // Compute which resources are produced by this number
                  // (simplified: describe the number and let LLM + RAG handle production)
                  const diceMsg: import('@/src/domain/entities').Message = {
                    id: `dice-${Date.now()}`, role: 'user',
                    content: `Dado: ${value}`,
                    timestamp: Date.now(),
                  }
                  setSession(s => ({ ...s, messages: [...s.messages, diceMsg] }))

                  if (value === 7) {
                    // Ladrón
                    const robberMsg: import('@/src/domain/entities').Message = {
                      id: `robber-${Date.now()}`, role: 'assistant',
                      content: 'Ha salido un 7. Si tienes más de 7 cartas debes descartar la mitad. Luego mueve el ladrón a un hex y roba una carta a un jugador adyacente.',
                      timestamp: Date.now(),
                    }
                    setSession(s => ({ ...s, messages: [...s.messages, robberMsg] }))
                    setCoachStep('waiting-dice')
                  } else {
                    // Ask LLM with dice context
                    const freshCoachState = {
                      boardSummary: buildBoardSummary(),
                      resources: savedResources,
                      geneticRecommendation: null,
                      turn: currentTurn,
                      devCards: savedDevCards,
                    }
                    await sendMessage(
                      `Ha salido un ${value}. ¿Qué recursos produzco y cuál es la mejor jugada para este turno?`,
                      freshCoachState,
                    )
                    setCoachStep('waiting-dice')
                  }
                }}
              />
            )}

            {/* ── Punto 3: Botón Iniciar Partida ── */}
            {boardConfigured && !gameStarted && coachStep === null && !isLoading && coachMode && (
              <div className="flex justify-start mb-3">
                <button
                  onClick={() => {
                    const startMsg: import('@/src/domain/entities').Message = {
                      id: `start-${Date.now()}`, role: 'assistant',
                      content: '¿Cuántas cartas de desarrollo tienes? Indícalas para que pueda tenerte en cuenta en las recomendaciones.',
                      timestamp: Date.now(),
                    }
                    setSession(s => ({ ...s, messages: [...s.messages, startMsg] }))
                    setCoachStep('waiting-devCards')
                  }}
                  className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  Iniciar partida
                </button>
              </div>
            )}

            {/* ── Punto 3: indicador de turno activo ── */}
            {gameStarted && coachStep === null && !isLoading && coachMode && (
              <div className="flex items-center gap-2 px-1 mb-1">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-stone-400 text-xs">Turno {currentTurn - 1} — Partida en curso</span>
                <button
                  onClick={() => setCoachStep('waiting-dice')}
                  className="ml-auto text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Siguiente turno →
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>}

          {/* Input area */}
          <div className="shrink-0 bg-stone-800 border-t border-stone-700 px-4 py-3">
            <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
              <div className="flex items-center gap-2 bg-stone-700 rounded-xl px-3 py-2 focus-within:ring-1 focus-within:ring-amber-600">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => { setInput(e.target.value); autoResize() }}
                  onKeyDown={handleKeyDown}
                  placeholder={hasSelectedMode ? 'Pregunta sobre Catan...' : 'Elige una opción para empezar'}
                  rows={1}
                  disabled={isLoading || !hasSelectedMode}
                  className="flex-1 bg-transparent text-stone-100 placeholder-stone-400 resize-none focus:outline-none disabled:opacity-50 text-sm leading-relaxed py-1 overflow-hidden"
                />
                <VoiceInput onTranscript={text => { setInput(prev => prev + text); setTimeout(autoResize, 0) }} disabled={isLoading || !hasSelectedMode} />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim() || !hasSelectedMode}
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
          </>}

        </div>
      </div>

      {/* ── Coach overlays ── */}
      {showAnalyzeModal && (
        <CoachAnalyzeModal
          onClose={() => { setShowAnalyzeModal(false) }}
          onPhoto={() => { setShowAnalyzeModal(false); setHasSelectedMode(true); setCoachMode(true); setShowCamera(true) }}
          onBoard={() => { setShowAnalyzeModal(false); setHasSelectedMode(true); setCoachMode(true); setShowBoard(true) }}
          onTextOnly={() => { setShowAnalyzeModal(false); setHasSelectedMode(true); setCoachMode(false) }}
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
              content: 'Foto del tablero enviada',
              timestamp: Date.now(),
            }
            setSession(s => ({ ...s, messages: [...s.messages, photoMsg] }))
            // Placeholder — vision analysis not yet implemented
            const analysisMsg: import('@/src/domain/entities').Message = {
              id: `analysis-${Date.now()}`, role: 'assistant',
              content: 'Foto recibida. El análisis automático de tablero está en desarrollo. Por ahora, configura las piezas manualmente con el editor de tablero.',
              timestamp: Date.now(),
            }
            setSession(s => ({ ...s, messages: [...s.messages, analysisMsg] }))
            setCoachStep(null)
          }}
        />
      )}


    </div>
  )
}
