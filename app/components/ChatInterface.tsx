'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { OnboardingTour } from './OnboardingTour'
import { CoachAnalyzeModal } from './coach/CoachAnalyzeModal'
import { CameraOverlay } from './coach/CameraOverlay'
import { BoardOverlay, type BoardConfirmPayload } from './coach/BoardOverlay'
import { ResourceStepperBubble } from './coach/ResourceStepperBubble'
import { DiceInputBubble } from './coach/DiceInputBubble'
import { DevCardStepper } from './coach/DevCardStepper'
import { ActionMenu, ActionChips, type GameAction } from './coach/ActionMenu'
import { computeResourcesFromDice, type ResourceCounts } from '@/src/lib/diceProduction'
import type { BoardRecommendation, BoardState as ConvBoardState } from '@/src/domain/entities'
import type { BoardRecommendationPreview } from './coach/BoardOverlay'
import { buildBoardSummary as geoBuildBoardSummary } from '@/src/lib/boardGeometry'
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
  const [showOnboarding, setShowOnboarding]     = useState(false)
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
  const [savedGeneticRec, setSavedGeneticRec]   = useState<null | {
    action: string; actionEs: string; score: number; reason: string; alternatives: unknown[]
    positionContext?: { mySettlements: string[]; myRoads: string[]; frontier: string[] }
  }>(null)
  // Ref para recursos recién confirmados (evita interceptor falso por closure asíncrono)
  const confirmedResourcesRef = useRef<Record<string,number> | null>(null)

  // ── Helper: construye el payload para /api/coach-recommend desde refs ────
  // Siempre usa los refs (valores actuales) — nunca el closure de los callbacks
  const buildGeneticPayload = useCallback((resourcesOverride?: Record<string,number>) => {
    const pieces      = savedPiecesRef.current
    const myColor     = savedMyColorRef.current
    const assignments = savedAssignmentsRef.current
    const resources   = resourcesOverride ?? savedResourcesRef.current ?? {}
    const robberHex   = savedRobberHexRef.current
    const longestRoad = savedLongestRoadRef.current
    const largestArmy = savedLargestArmyRef.current
    const knightsPlayed = savedKnightsPlayedRef.current
    const devCards    = savedDevCardsRef.current
    const turn        = currentTurnRef.current

    const pieceKeys     = Object.keys(pieces)
    const settlements   = pieceKeys.filter(k => k.startsWith('v') && pieces[k].color === myColor && pieces[k].type === 'settlement').map(k => parseInt(k.slice(1)))
    const cities        = pieceKeys.filter(k => k.startsWith('v') && pieces[k].color === myColor && pieces[k].type === 'city').map(k => parseInt(k.slice(1)))
    const roads         = pieceKeys.filter(k => k.startsWith('e') && pieces[k].color === myColor).map(k => k.slice(1))
    const rivals        = assignments.filter(c => c !== myColor).map(color => ({
      color,
      vp: pieceKeys.filter(k => k.startsWith('v') && pieces[k].color === color && pieces[k].type === 'settlement').length
        + pieceKeys.filter(k => k.startsWith('v') && pieces[k].color === color && pieces[k].type === 'city').length * 2,
      settlements: pieceKeys.filter(k => k.startsWith('v') && pieces[k].color === color && pieces[k].type === 'settlement').map(k => parseInt(k.slice(1))),
      cities:      pieceKeys.filter(k => k.startsWith('v') && pieces[k].color === color && pieces[k].type === 'city').map(k => parseInt(k.slice(1))),
      roads:       pieceKeys.filter(k => k.startsWith('e') && pieces[k].color === color).map(k => k.slice(1)),
      knights_played: 0,
    }))
    const vpBase  = settlements.length + cities.length * 2
    const vpBonus = (longestRoad ? 2 : 0) + (largestArmy ? 2 : 0)

    return {
      resources, settlements, cities, roads,
      vp: vpBase + vpBonus,
      roadLength: roads.length,
      knightsPlayed, longestRoad, largestArmy,
      otherPlayers: rivals,
      gamePhasePlaying: true,
      robberHex, turn,
      devCards,
    }
  }, [])

  // Ref para capturar el estado del tablero recién confirmado (evita problema de closure asíncrono)
  const pendingBoardRef = useRef<{
    pieces: Record<string,{type:'settlement'|'city'|'road';color:string}>
    myColor: string
    assignments: string[]
    robberHex: number
  } | null>(null)

  // Fase A — rival state for GeneticAgent
  const [savedKnightsPlayed, setSavedKnightsPlayed] = useState<number>(0)
  const [savedLongestRoad, setSavedLongestRoad]     = useState<boolean>(false)
  const [savedLargestArmy, setSavedLargestArmy]     = useState<boolean>(false)

  // ── Live refs para sendMessage (evita stale closures) ─────────────────────
  const coachModeRef          = useRef(false)
  const boardConfiguredRef    = useRef(false)
  const savedResourcesRef     = useRef<Record<string,number> | null>(null)
  const savedGeneticRecRef    = useRef<typeof savedGeneticRec>(null)
  const savedPiecesRef        = useRef<typeof savedPieces>({})
  const savedMyColorRef       = useRef('red')
  const savedAssignmentsRef   = useRef<string[]>([])
  const savedRobberHexRef     = useRef(9)
  const savedDevCardsRef      = useRef<Record<string,number> | null>(null)
  const gameStartedRef        = useRef(false)
  const currentTurnRef        = useRef(1)
  const savedLongestRoadRef   = useRef(false)
  const savedLargestArmyRef   = useRef(false)
  const savedKnightsPlayedRef = useRef(0)

  // Fases 2-4 — board recommendation preview
  const [pendingRecommendation, setPendingRecommendation] = useState<BoardRecommendationPreview | null>(null)
  const boardConfigured = Object.keys(savedPieces).length > 0

  // Sync live refs on every render (evita stale closures en sendMessage)
  coachModeRef.current          = coachMode
  boardConfiguredRef.current    = boardConfigured
  savedResourcesRef.current     = savedResources
  savedGeneticRecRef.current    = savedGeneticRec
  savedPiecesRef.current        = savedPieces
  savedMyColorRef.current       = savedMyColor
  savedAssignmentsRef.current   = savedAssignments
  savedRobberHexRef.current     = savedRobberHex
  savedDevCardsRef.current      = savedDevCards
  gameStartedRef.current        = gameStarted
  currentTurnRef.current        = currentTurn
  savedLongestRoadRef.current   = savedLongestRoad
  savedLargestArmyRef.current   = savedLargestArmy
  savedKnightsPlayedRef.current = savedKnightsPlayed

  /**
   * buildBoardSummary — delega en boardGeometry.buildBoardSummary
   * Usa los refs para obtener siempre los valores actuales (no stale closures)
   */
  const buildBoardSummary = useCallback((): string =>
    geoBuildBoardSummary(
      savedPiecesRef.current,
      savedMyColorRef.current,
      savedAssignmentsRef.current,
      savedResourcesRef.current,
      savedRobberHexRef.current,
    )
  , [])
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
  // Init onboarding after hydration (avoids SSR mismatch)
  useEffect(() => {
    if (localStorage.getItem('catan-onboarding-done') !== '1') {
      setShowOnboarding(true)
    }
  }, [])

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
        // Si tenía mensajes de usuario, mostrar el chat directamente (no las 3 opciones)
        const hadUserMsgs = saved.messages.some(m => m.role === 'user')
        if (hadUserMsgs) setHasSelectedMode(true)
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
  // Captura el boardState actual para persistirlo con la conversación
  const captureBoardState = useCallback((): ConvBoardState => ({
    pieces:      savedPieces,
    myColor:     savedMyColor,
    assignments: savedAssignments,
    resources:   savedResources,
    robberHex:   savedRobberHex,
    devCards:    savedDevCards,
    gameStarted,
    currentTurn,
    coachMode,
    hasSelectedMode,
    longestRoad: savedLongestRoad,
    largestArmy: savedLargestArmy,
    knightsPlayed: savedKnightsPlayed,
  }), [savedPieces, savedMyColor, savedAssignments, savedResources, savedRobberHex,
       savedDevCards, gameStarted, currentTurn, coachMode, hasSelectedMode,
       savedLongestRoad, savedLargestArmy, savedKnightsPlayed])

  // Restaura el boardState de una conversación guardada
  const restoreBoardState = useCallback((bs: ConvBoardState | undefined) => {
    if (!bs) return
    setSavedPieces(bs.pieces ?? {})
    setSavedMyColor(bs.myColor ?? 'red')
    setSavedAssignments(bs.assignments ?? [])
    setSavedResources(bs.resources ?? null)
    setSavedRobberHex(bs.robberHex ?? 9)
    setSavedDevCards(bs.devCards ?? null)
    setGameStarted(bs.gameStarted ?? false)
    setCurrentTurn(bs.currentTurn ?? 1)
    setCoachMode(bs.coachMode ?? false)
    setHasSelectedMode(bs.hasSelectedMode ?? false)
    setSavedLongestRoad(bs.longestRoad ?? false)
    setSavedLargestArmy(bs.largestArmy ?? false)
    setSavedKnightsPlayed(bs.knightsPlayed ?? 0)
  }, [])

  const persistToHistory = useCallback((updatedSession: Session, convId: string, boardState?: ConvBoardState) => {
    const userMsgs = updatedSession.messages.filter(m => m.role === 'user')
    if (userMsgs.length === 0) return  // no guardamos si no hay mensajes del usuario

    const title = titleFromSession(updatedSession)
    const now = Date.now()

    setHistory(prev => {
      const existing = prev.find(c => c.id === convId)
      let next: Conversation[]
      if (existing) {
        next = prev.map(c => c.id === convId
          ? { ...c, title, session: updatedSession, lastActiveAt: now, ...(boardState ? { boardState } : {}) }
          : c
        )
      } else {
        const newConv: Conversation = { id: convId, title, session: updatedSession, createdAt: now, lastActiveAt: now, ...(boardState ? { boardState } : {}) }
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
    setSavedGeneticRec(null)
    setSavedDevCards(null)
    setSavedKnightsPlayed(0)
    setSavedLongestRoad(false)
    setSavedLargestArmy(false)
    setPendingRecommendation(null)
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
    // Restaurar estado del tablero de esta conversación
    restoreBoardState(conv.boardState)
    // Si la conversación tiene mensajes de usuario, mostrar el chat directamente
    const hasUserMsgs = conv.session.messages.some(m => m.role === 'user')
    if (hasUserMsgs) setHasSelectedMode(true)
    // Reset estado transitorio
    setSavedGeneticRec(null)
    setPendingRecommendation(null)
    setCoachStep(null)
    setShowBoard(false)
    setShowCamera(false)
  }, [restoreBoardState])

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

    // ── Detección de preguntas estratégicas sin recursos ─────────────────────
    // Si el usuario pregunta por jugadas/estrategia en modo coach con tablero
    // pero sin recursos guardados → interrumpir y pedir recursos primero
    const STRATEGY_KEYWORDS = ['mejor jugada','qué hago','qué construir','recomend','qué puedo hacer','mejor opción','siguiente paso']
    // Usar refs para leer valores actuales (no el closure stale)
    const hasResources = savedResourcesRef.current !== null || confirmedResourcesRef.current !== null
    const isStrategyQuestion = coachModeRef.current && boardConfiguredRef.current && !hasResources &&
      STRATEGY_KEYWORDS.some(kw => text.toLowerCase().includes(kw))

    if (isStrategyQuestion) {
      const nudgeMsg: import('@/src/domain/entities').Message = {
        id: `nudge-${Date.now()}`, role: 'assistant',
        content: 'Antes de recomendarte la mejor jugada, dime qué cartas de recurso tienes en mano:',
        timestamp: Date.now(),
      }
      setSession(s => ({ ...s, messages: [...s.messages, nudgeMsg] }))
      setCoachStep('waiting-resources')
      setIsLoading(false)
      setStreamingContent('')
      return
    }

    // Limpiar ref de recursos tras usarlo
    confirmedResourcesRef.current = null

    // ── Leer valores actuales desde refs (no closures stale) ─────────────────
    const _coachMode        = coachModeRef.current
    const _boardConfigured  = boardConfiguredRef.current
    const _savedResources   = savedResourcesRef.current
    const _savedGeneticRec  = savedGeneticRecRef.current
    const _savedPieces      = savedPiecesRef.current
    const _savedMyColor     = savedMyColorRef.current
    const _savedAssignments = savedAssignmentsRef.current
    const _savedRobberHex   = savedRobberHexRef.current
    const _savedDevCards    = savedDevCardsRef.current
    const _gameStarted      = gameStartedRef.current
    const _currentTurn      = currentTurnRef.current
    const _longestRoad      = savedLongestRoadRef.current
    const _largestArmy      = savedLargestArmyRef.current
    const _knightsPlayed    = savedKnightsPlayedRef.current

    // ── Si hay tablero + modo coach pero sin GeneticRec fresco, consultar API ─
    let freshGeneticRec = _savedGeneticRec
    if (_coachMode && _boardConfigured && _savedResources && !_savedGeneticRec) {
      try {
        const payload = buildGeneticPayload()
        const res = await fetch('/api/coach-recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) { freshGeneticRec = await res.json(); setSavedGeneticRec(freshGeneticRec) }
      } catch { /* GeneticAgent opcional */ }
    }

    // Build coachState con valores frescos de los refs
    const baseCoachState = _boardConfigured ? {
      boardSummary: buildBoardSummary(),
      resources: _savedResources,
      geneticRecommendation: freshGeneticRec,
      ...(_gameStarted ? {
        turn: _currentTurn,
        devCards: _savedDevCards,
      } : {}),
    } : undefined
    // Si hay override explícito, usarlo siempre.
    // Si no hay override pero el tablero está configurado, SIEMPRE enviar coachState
    // (independientemente de _coachMode, que puede estar stale/false por closures)
    const activeCoachState = coachStateOverride
      ?? (_boardConfigured ? baseCoachState : undefined)

    let fullResponse = ''
    let suggestions: string[] = []
    let agentUsed: string = 'direct'
    let boardRecommendation: import('@/src/domain/entities').BoardRecommendation | undefined

    // DEBUG: log what we send to the API
    const _mode = (_boardConfigured || !!coachStateOverride) ? 'coach' : 'aprende'
    console.log('[sendMessage] DEBUG', {
      msg: text.trim().slice(0, 60),
      mode: _mode,
      hasOverride: !!coachStateOverride,
      boardConfigured: _boardConfigured,
      coachMode: _coachMode,
      hasActiveCoachState: !!activeCoachState,
      boardSummaryPreview: activeCoachState?.boardSummary?.slice(0, 80) ?? 'NONE',
      resources: activeCoachState?.resources ?? 'NONE',
    })

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          history: session.messages.slice(-10),
          userLevel: updatedLevel,
          seenConcepts,
          // Si hay tablero configurado o override explícito → siempre mode coach
          mode: _mode,
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
            else if (event.type === 'done') {
              suggestions = event.suggestedQuestions || []
              agentUsed = event.agentUsed || 'direct'
              if (event.boardRecommendation) boardRecommendation = event.boardRecommendation
            }
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
      ...(boardRecommendation ? { boardRecommendation } : {}),
    }

    const newMessages: Message[] = [assistantMessage]
    if (progressionMsg) newMessages.push({ id: `progress-${Date.now()}`, role: 'assistant', content: progressionMsg, timestamp: Date.now() + 1 })

    const currentBoardState = captureBoardState()
    setSession(s => {
      const updated = { ...s, messages: [...s.messages, ...newMessages], conceptMap: updatedConceptMap, userLevel: updatedLevel, lastActiveAt: Date.now() }
      saveCurrentSession(updated)
      persistToHistory(updated, convId, currentBoardState)
      return updated
    })

    setLastSuggestions(suggestions)
    setStreamingContent('')
    setIsLoading(false)
  }, [session, isLoading, activeConvId, persistToHistory, captureBoardState, buildGeneticPayload])

  // ── Handler para el menú de acciones contextuales ────────
  const handleGameAction = useCallback((action: GameAction) => {
    switch (action) {
      case 'update-resources':
        setCoachStep('waiting-resources')
        break
      case 'add-dev-cards': {
        const msg: import('@/src/domain/entities').Message = {
          id: `devcard-prompt-${Date.now()}`, role: 'assistant',
          content: 'Indica tus cartas de desarrollo actuales.',
          timestamp: Date.now(),
        }
        setSession(s => ({ ...s, messages: [...s.messages, msg] }))
        setCoachStep('waiting-devCards')
        break
      }
      case 'move-robber': {
        const msg: import('@/src/domain/entities').Message = {
          id: `robber-prompt-${Date.now()}`, role: 'assistant',
          content: 'Abre el tablero (icono del hexágono en la esquina superior) y arrastra el ladrón al nuevo hex. Cuando confirmes, actualizaré el estado.',
          timestamp: Date.now(),
        }
        setSession(s => ({ ...s, messages: [...s.messages, msg] }))
        setShowBoard(true)
        break
      }
      case 'update-board':
        setShowBoard(true)
        break
      case 'next-turn':
        setCoachStep('waiting-dice')
        break
    }
  }, [])

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
          data-tour="board-btn"
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
              gameStarted={gameStarted}
              previewRecommendation={pendingRecommendation ?? undefined}
              onConfirmRecommendation={pendingRecommendation ? () => {
                // Fase 4 — registrar la jugada en el estado automáticamente
                const rec = pendingRecommendation
                const myColor = savedMyColor
                if (rec.type === 'road' || rec.type === 'settlement' || rec.type === 'city') {
                  const key = rec.position.startsWith('v') || rec.position.startsWith('e')
                    ? rec.position
                    : rec.position.includes('_') ? `e${rec.position}` : `v${rec.position}`
                  setSavedPieces(prev => ({
                    ...prev,
                    [key]: { type: rec.type === 'road' ? 'road' : rec.type === 'settlement' ? 'settlement' : 'city', color: myColor }
                  }))
                  const confirmMsg: import('@/src/domain/entities').Message = {
                    id: `confirm-rec-${Date.now()}`, role: 'user',
                    content: `Jugada realizada: ${rec.type === 'road' ? 'Camino' : rec.type === 'settlement' ? 'Poblado' : 'Ciudad'} en ${rec.label}`,
                    timestamp: Date.now(),
                  }
                  setSession(s => ({ ...s, messages: [...s.messages, confirmMsg] }))
                }
                setPendingRecommendation(null)
              } : undefined}
              onClose={() => { setShowBoard(false); setPendingRecommendation(null) }}
              onConfirm={({ pieces, myColor, assignments, robberHex }) => {
                setShowBoard(false)
                setSavedPieces(pieces)
                setSavedMyColor(myColor)
                setSavedAssignments(assignments)
                setSavedRobberHex(robberHex)
                setCoachMode(true)  // asegurar que coachMode refleje realidad
                // Guardar en ref para que el ResourceStepper use datos frescos (no el estado asíncrono)
                pendingBoardRef.current = { pieces, myColor, assignments, robberHex }
                const isUpdate = boardConfigured
                const colorNames: Record<string,string> = { red:'Rojo', blue:'Azul', orange:'Naranja', white:'Blanco' }

                // Build per-player piece count summary for the chat message
                const pieceSummary = assignments.map(color => {
                  const label = colorNames[color] ?? color
                  const isMe = color === myColor
                  const s = Object.values(pieces).filter(p => p.color === color && p.type === 'settlement').length
                  const c = Object.values(pieces).filter(p => p.color === color && p.type === 'city').length
                  const r = Object.values(pieces).filter(p => p.color === color && p.type === 'road').length
                  const parts = []
                  if (s > 0) parts.push(`${s} poblado${s>1?'s':''}`)
                  if (c > 0) parts.push(`${c} ciudad${c>1?'es':''}`)
                  if (r > 0) parts.push(`${r} camino${r>1?'s':''}`)
                  return `${isMe ? `Tú (${label})` : label}: ${parts.join(', ') || 'sin piezas'}`
                }).join(' · ')

                const boardMsg: import('@/src/domain/entities').Message = {
                  id: `board-${Date.now()}`, role: 'user',
                  content: isUpdate
                    ? `Tablero actualizado — ${pieceSummary}`
                    : `Tablero configurado — ${pieceSummary}`,
                  timestamp: Date.now(),
                }
                // Mensaje de confirmación rico con datos reales del tablero
                const _colorNames: Record<string,string> = { red:'Rojo', blue:'Azul', orange:'Naranja', white:'Blanco' }
                const totalPlayers = assignments.length
                const myPieceCount = Object.keys(pieces).filter(k => pieces[k].color === myColor).length

                // Resumen por jugador para el mensaje de confirmación
                const playerSummaryLines = assignments.map(color => {
                  const label = _colorNames[color] ?? color
                  const isMe  = color === myColor
                  const sett  = Object.values(pieces).filter(p => p.color === color && p.type === 'settlement').length
                  const road  = Object.values(pieces).filter(p => p.color === color && p.type === 'road').length
                  return `- ${isMe ? `**Tú (${label})**` : label}: ${sett} poblado${sett !== 1 ? 's' : ''}, ${road} camino${road !== 1 ? 's' : ''}`
                }).join('\n')

                // Producción usando boardGeometry importado al inicio del archivo
                const _terrNames: Record<string,string> = { clay:'arcilla', mineral:'mineral', wood:'madera', cereal:'trigo', wool:'lana' }
                const mySettKeys = Object.keys(pieces).filter(k => k.startsWith('v') && pieces[k].color === myColor && pieces[k].type === 'settlement')
                const myProdDescs = mySettKeys.map(k => {
                  const vid  = parseInt(k.slice(1))
                  // usar el boardSummary pre-construido con pendingBoardRef para extraer producción
                  // pero más simple: describir directamente los hexes del vértice
                  return `poblado v${vid}`
                })

                const confirmText = isUpdate
                  ? `Tablero actualizado. He registrado tus ${myPieceCount} piezas.\n\nIndica tus recursos actuales para recibir una recomendación ajustada.`
                  : `Tablero listo para ${totalPlayers} jugador${totalPlayers > 1 ? 'es' : ''}:\n${playerSummaryLines}\n\nTodo registrado correctamente. Ahora **dime qué cartas de recurso tienes en mano** para que pueda darte la mejor jugada posible.`

                const replyMsg: import('@/src/domain/entities').Message = {
                  id: `board-reply-${Date.now()}`, role: 'assistant',
                  content: confirmText,
                  timestamp: Date.now(),
                }
                setSession(s => {
                  const updated = { ...s, messages: [...s.messages, boardMsg, replyMsg] }
                  // Persistir tablero en historial aunque no haya mensaje de usuario aún
                  const convId = activeConvId || `conv-${Date.now()}`
                  const bs: ConvBoardState = {
                    pieces, myColor, assignments, resources: null, robberHex,
                    devCards: null, gameStarted: false, currentTurn: 1,
                    coachMode: true, hasSelectedMode: true,
                    longestRoad: false, largestArmy: false, knightsPlayed: 0,
                  }
                  persistToHistory(updated, convId, bs)
                  return updated
                })
                setCoachStep('waiting-resources')
              }}
            />
          )}

          {!showBoard && <>
          {/* ── Mode selection — solo en conversaciones nuevas sin historial de usuario ── */}
          {!hasSelectedMode && session.messages.filter(m => m.role === 'user').length === 0 && (
            <div className="flex-1 flex flex-col justify-end pb-6 px-4">
              <div data-tour="mode-select" className="max-w-lg mx-auto w-full flex flex-col gap-4">
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
              <MessageBubble
                key={msg.id}
                message={msg}
                onShowRecommendation={coachMode && boardConfigured ? (rec: BoardRecommendation) => {
                  setPendingRecommendation({ type: rec.type, position: rec.position, label: rec.label })
                  setShowBoard(true)
                } : undefined}
              />
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
                  setSavedResources(counts)
                  confirmedResourcesRef.current = counts  // evita interceptor falso

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
                    const payload = buildGeneticPayload(counts)
                    const apiRes = await fetch('/api/coach-recommend', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    })
                    if (apiRes.ok) { geneticRec = await apiRes.json(); setSavedGeneticRec(geneticRec) }
                  } catch { /* GeneticAgent optional */ }

                  // 2. Build coachState — usar pendingBoardRef si está disponible
                  // (evita el problema de closure asíncrono con savedPieces)
                  const boardData = pendingBoardRef.current
                  const freshBoardSummary = boardData
                    ? geoBuildBoardSummary(boardData.pieces, boardData.myColor, boardData.assignments, counts, boardData.robberHex)
                    : buildBoardSummary()
                  pendingBoardRef.current = null  // limpiar tras usar

                  const freshCoachState = {
                    boardSummary: freshBoardSummary,
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
                    // Ladrón — mostrar instrucciones y pedir que mueva el ladrón
                    const totalCards = savedResources
                      ? Object.values(savedResources).reduce((a, b) => a + b, 0)
                      : 0
                    const discardNote = totalCards > 7
                      ? ` Tienes ${totalCards} cartas — debes descartar ${Math.floor(totalCards / 2)}.`
                      : ''
                    const robberMsg: import('@/src/domain/entities').Message = {
                      id: `robber-${Date.now()}`, role: 'assistant',
                      content: `Ha salido un 7.${discardNote} Mueve el ladrón: abre el tablero con el icono del hexágono y toca el hex donde quieres colocarlo.`,
                      timestamp: Date.now(),
                    }
                    setSession(s => ({ ...s, messages: [...s.messages, robberMsg] }))
                    setCoachStep('waiting-dice')
                  } else {
                    // ── Cálculo automático de producción ─────────────────────
                    const diceResult = computeResourcesFromDice(
                      value,
                      savedPieces,
                      savedMyColor,
                      savedRobberHex,
                      savedResources as ResourceCounts | null,
                    )

                    // Actualizar recursos automáticamente
                    setSavedResources(diceResult.newTotals)
                    setSavedGeneticRec(null)  // limpiar rec del turno anterior

                    // Mensaje en el chat con el resumen de producción
                    const productionMsg: import('@/src/domain/entities').Message = {
                      id: `prod-${Date.now()}`, role: 'assistant',
                      content: diceResult.summary,
                      timestamp: Date.now(),
                    }
                    setSession(s => ({ ...s, messages: [...s.messages, productionMsg] }))

                    // Consultar GeneticAgent con los recursos ya actualizados
                    let geneticRec = null
                    try {
                      const payload = buildGeneticPayload(diceResult.newTotals)
                      const apiRes = await fetch('/api/coach-recommend', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                      })
                      if (apiRes.ok) { geneticRec = await apiRes.json(); setSavedGeneticRec(geneticRec) }
                    } catch { /* GeneticAgent optional */ }

                    // Pedir recomendación al LLM con contexto completo
                    const freshCoachState = {
                      boardSummary:          buildBoardSummary(),
                      resources:             diceResult.newTotals,
                      geneticRecommendation: geneticRec,
                      turn:                  currentTurn,
                      devCards:              savedDevCards,
                    }
                    await sendMessage(
                      '¿Cuál es la mejor jugada para este turno?',
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
                    // Turno 0: nadie tiene cartas de desarrollo aún — ir directamente al dado
                    const startMsg: import('@/src/domain/entities').Message = {
                      id: `start-${Date.now()}`, role: 'assistant',
                      content: 'Partida iniciada. Turno 1. ¿Cuál es el resultado del dado?',
                      timestamp: Date.now(),
                    }
                    setSession(s => ({ ...s, messages: [...s.messages, startMsg] }))
                    setSavedDevCards({ knight: 0, monopoly: 0, year_of_plenty: 0, road_building: 0, vp: 0 })
                    setGameStarted(true)
                    setCurrentTurn(1)
                    setCoachStep('waiting-dice')
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
            <div className="max-w-2xl mx-auto flex flex-col gap-2">
              {/* Desktop: action chips encima del input (md+) */}
              {hasSelectedMode && coachMode && (
                <div className="hidden md:flex">
                  <ActionChips
                    gameStarted={gameStarted}
                    boardConfigured={boardConfigured}
                    onAction={handleGameAction}
                  />
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="flex items-center gap-2 bg-stone-700 rounded-xl px-3 py-2 focus-within:ring-1 focus-within:ring-amber-600">
                  {/* Móvil: botón + a la izquierda (oculto en md+) */}
                  {hasSelectedMode && coachMode && (
                    <div className="md:hidden">
                      <ActionMenu
                        gameStarted={gameStarted}
                        boardConfigured={boardConfigured}
                        onAction={handleGameAction}
                      />
                    </div>
                  )}
                  <textarea
                    data-tour="chat-input"
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
          </div>
          </>}

        </div>
      </div>

      {/* ── Onboarding tour — first time only ── */}
      {showOnboarding && (
        <OnboardingTour
          onDone={() => {
            setShowOnboarding(false)
            setShowBoard(false)
            localStorage.setItem('catan-onboarding-done', '1')
          }}
          onOpenBoard={() => {
            setHasSelectedMode(true)
            setCoachMode(true)
            setShowBoard(true)
          }}
          onCloseBoard={() => setShowBoard(false)}
        />
      )}

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
