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
import type { BoardRecommendation } from '@/src/domain/entities'
import type { BoardRecommendationPreview } from './coach/BoardOverlay'
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
  // Fases 2-4 — board recommendation preview
  const [pendingRecommendation, setPendingRecommendation] = useState<BoardRecommendationPreview | null>(null)
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

  /** Build board summary desde datos directos (sin depender del estado React) */
  const buildBoardSummaryFromData = useCallback((
    pieces: Record<string,{type:'settlement'|'city'|'road';color:string}>,
    myColor: string,
    assignments: string[],
    resources: Record<string,number> | null,
    robberHex: number,
  ): string => {
    if (Object.keys(pieces).length === 0) return 'Tablero vacío'
    // Reusar la lógica existente con los datos pasados directamente
    const savedPiecesSnapshot = pieces
    const savedMyColorSnapshot = myColor
    const savedAssignmentsSnapshot = assignments
    const savedResourcesSnapshot = resources
    const savedRobberHexSnapshot = robberHex

    const colorNames: Record<string,string> = { red:'Rojo', blue:'Azul', orange:'Naranja', white:'Blanco' }
    const terrainNames: Record<string,string> = {
      clay:'arcilla', mineral:'mineral', wood:'madera', cereal:'trigo', wool:'oveja', desert:'desierto'
    }
    const myLabel = colorNames[savedMyColorSnapshot] ?? savedMyColorSnapshot
    const ANGLES_rad = [30,90,150,210,270,330].map(d => d * Math.PI / 180)
    const vertIdToHexes = new Map<number, number[]>()
    const vertMap2 = new Map<string, number>()
    let vId2 = 0
    HEX_CENTERS_CI.forEach(([cx, cy], hi) => {
      for (const a of ANGLES_rad) {
        const vx = cx + R_CI * Math.cos(a), vy = cy + R_CI * Math.sin(a)
        const k = approxKeyCI(vx, vy)
        if (!vertMap2.has(k)) { vertMap2.set(k, vId2++); }
        const vid = vertMap2.get(k)!
        if (!vertIdToHexes.has(vid)) vertIdToHexes.set(vid, [])
        const arr = vertIdToHexes.get(vid)!
        if (!arr.includes(hi)) arr.push(hi)
      }
    })
    const edgeToHexes2 = new Map<string, number[]>()
    HEX_CENTERS_CI.forEach(([cx, cy], hi) => {
      const vIds: number[] = []
      for (const a of ANGLES_rad) {
        const vx = cx + R_CI * Math.cos(a), vy = cy + R_CI * Math.sin(a)
        vIds.push(vertMap2.get(approxKeyCI(vx, vy)) ?? -1)
      }
      for (let i = 0; i < 6; i++) {
        const a = vIds[i], b = vIds[(i+1)%6]
        if (a < 0 || b < 0) continue
        const eid = `${Math.min(a,b)}_${Math.max(a,b)}`
        if (!edgeToHexes2.has(eid)) edgeToHexes2.set(eid, [])
        const arr2 = edgeToHexes2.get(eid)!
        if (!arr2.includes(hi)) arr2.push(hi)
      }
    })
    const DOTS2: Record<number,number> = {2:1,3:2,4:3,5:4,6:5,7:6,8:5,9:4,10:3,11:2,12:1}
    const byColor: Record<string, { settlements: string[], cities: string[], roads: string[] }> = {}
    for (const [key, piece] of Object.entries(savedPiecesSnapshot)) {
      const c = piece.color
      if (!byColor[c]) byColor[c] = { settlements: [], cities: [], roads: [] }
      let hexIndices: number[] = []
      if (key.startsWith('v')) hexIndices = vertIdToHexes.get(parseInt(key.slice(1))) ?? []
      else if (key.startsWith('e')) hexIndices = edgeToHexes2.get(key.slice(1)) ?? []
      const richHexDescs = hexIndices
        .filter(hi => TERRAIN_ORDER_CI[hi] !== 'desert' && NUMBERS_CI[hi] > 0)
        .map(hi => { const t = terrainNames[TERRAIN_ORDER_CI[hi]] ?? TERRAIN_ORDER_CI[hi]; const n = NUMBERS_CI[hi]; const dots = DOTS2[n] ?? 0; const isRobber = savedRobberHexSnapshot === hi; return `${t}(${n}=${dots}pts${isRobber ? ',LADRÓN' : ''})` })
      const totalDots = hexIndices.filter(hi => TERRAIN_ORDER_CI[hi] !== 'desert' && NUMBERS_CI[hi] > 0 && savedRobberHexSnapshot !== hi).reduce((acc, hi) => acc + (DOTS2[NUMBERS_CI[hi]] ?? 0), 0)
      const desc = richHexDescs.length > 0 ? `[${richHexDescs.join('+')}→${totalDots}pts/turno]` : '[sin producción]'
      if (piece.type === 'settlement') byColor[c].settlements.push(desc)
      else if (piece.type === 'city')  byColor[c].cities.push(desc + '×2')
      else if (piece.type === 'road')  byColor[c].roads.push(desc)
    }
    const playerLines: string[] = []
    const playerOrder = savedAssignmentsSnapshot.length > 0 ? savedAssignmentsSnapshot : Object.keys(byColor)
    for (const color of playerOrder) {
      const s = byColor[color]; if (!s) continue
      const label = colorNames[color] ?? color; const isMe = color === savedMyColorSnapshot
      const myPieces2 = Object.entries(savedPiecesSnapshot).filter(([,p]) => p.color === color)
      const producedResources2 = new Set<string>(); let totalProdPts2 = 0
      for (const [key] of myPieces2) {
        const hexInds2 = key.startsWith('v') ? vertIdToHexes.get(parseInt(key.slice(1))) ?? [] : edgeToHexes2.get(key.slice(1)) ?? []
        for (const hi of hexInds2) { if (TERRAIN_ORDER_CI[hi] !== 'desert' && NUMBERS_CI[hi] > 0 && savedRobberHexSnapshot !== hi) { producedResources2.add(terrainNames[TERRAIN_ORDER_CI[hi]] ?? TERRAIN_ORDER_CI[hi]); totalProdPts2 += DOTS2[NUMBERS_CI[hi]] ?? 0 } }
      }
      const parts: string[] = []
      if (s.settlements.length > 0) parts.push(`${s.settlements.length} poblado${s.settlements.length>1?'s':''}: ${s.settlements.join(' y ')}`)
      if (s.cities.length > 0)      parts.push(`${s.cities.length} ciudad${s.cities.length>1?'es':''}: ${s.cities.join(' y ')}`)
      if (s.roads.length > 0)       parts.push(`${s.roads.length} camino${s.roads.length>1?'s':''}`)
      if (producedResources2.size > 0) parts.push(`produce: ${[...producedResources2].join('+')} (~${totalProdPts2}pts/turno)`)
      if (parts.length > 0) playerLines.push(`${isMe ? `TU COLOR (${label})` : label}:\n  ${parts.join('\n  ')}`)
    }
    const RES_ES2: Record<string,string> = { wood:'madera', clay:'arcilla', cereal:'trigo', wool:'lana', mineral:'mineral' }
    const resourceLine2 = savedResourcesSnapshot ? Object.entries(savedResourcesSnapshot).filter(([,v]) => v > 0).map(([k,v]) => `${RES_ES2[k]||k}×${v}`).join(', ') : null
    let robberLine2 = ''
    if (savedRobberHexSnapshot !== 9) { const rTerrain = TERRAIN_ORDER_CI[savedRobberHexSnapshot] ?? 'desconocido'; const rNum = NUMBERS_CI[savedRobberHexSnapshot] ?? 0; robberLine2 = `\nLADRÓN: bloqueando ${terrainNames[rTerrain] ?? rTerrain}(${rNum}) — ese hex NO produce` }
    let summary2 = `POSICIONES EN EL TABLERO:\n${playerLines.join('\n') || 'Sin piezas colocadas'}`
    if (resourceLine2) summary2 += `\n\nRECURSOS EN MANO (${myLabel.toUpperCase()}): ${resourceLine2}`
    if (robberLine2) summary2 += robberLine2
    return summary2
  }, [HEX_CENTERS_CI, R_CI, approxKeyCI, TERRAIN_ORDER_CI, NUMBERS_CI])

  /** Build full board context string for the LLM */
  const buildBoardSummary = useCallback((): string => {
    if (Object.keys(savedPieces).length === 0) return 'Tablero vacío'

    const colorNames: Record<string,string> = { red:'Rojo', blue:'Azul', orange:'Naranja', white:'Blanco' }
    const terrainNames: Record<string,string> = {
      clay:'arcilla', mineral:'mineral', wood:'madera', cereal:'trigo', wool:'oveja', desert:'desierto'
    }
    const myLabel = colorNames[savedMyColor] ?? savedMyColor

    // Build complete vertex id → hex indices map (mirrors buildGraph in BoardOverlay)
    const ANGLES_rad = [30,90,150,210,270,330].map(d => d * Math.PI / 180)
    const vertIdToHexes = new Map<number, number[]>()
    const vertMap = new Map<string, number>() // approxKey → vertId
    let vId = 0
    HEX_CENTERS_CI.forEach(([cx, cy], hi) => {
      for (const a of ANGLES_rad) {
        const vx = cx + R_CI * Math.cos(a)
        const vy = cy + R_CI * Math.sin(a)
        const k = approxKeyCI(vx, vy)
        if (!vertMap.has(k)) { vertMap.set(k, vId++); }
        const vid = vertMap.get(k)!
        if (!vertIdToHexes.has(vid)) vertIdToHexes.set(vid, [])
        const arr = vertIdToHexes.get(vid)!
        if (!arr.includes(hi)) arr.push(hi)
      }
    })

    // Build edge id → hex indices map (edge id = "lo_hi" vertex ids)
    const edgeToHexes = new Map<string, number[]>()
    HEX_CENTERS_CI.forEach(([cx, cy], hi) => {
      const vIds: number[] = []
      for (const a of ANGLES_rad) {
        const vx = cx + R_CI * Math.cos(a); const vy = cy + R_CI * Math.sin(a)
        vIds.push(vertMap.get(approxKeyCI(vx, vy)) ?? -1)
      }
      for (let i = 0; i < 6; i++) {
        const a = vIds[i], b = vIds[(i+1)%6]
        if (a < 0 || b < 0) continue
        const eid = `${Math.min(a,b)}_${Math.max(a,b)}`
        if (!edgeToHexes.has(eid)) edgeToHexes.set(eid, [])
        const arr = edgeToHexes.get(eid)!
        if (!arr.includes(hi)) arr.push(hi)
      }
    })

    // Group pieces by color
    const byColor: Record<string, { settlements: string[], cities: string[], roads: string[] }> = {}
    // Probability dots per number (same as GeneticAgent NUMBER_DOTS)
    const DOTS: Record<number,number> = {2:1,3:2,4:3,5:4,6:5,7:6,8:5,9:4,10:3,11:2,12:1}

    // Per-vertex: accumulate production score and hex descriptions
    const vertexProduction = new Map<number, { hexDescs: string[], dots: number }>()

    for (const [key, piece] of Object.entries(savedPieces)) {
      const c = piece.color
      if (!byColor[c]) byColor[c] = { settlements: [], cities: [], roads: [] }

      let hexIndices: number[] = []
      if (key.startsWith('v')) {
        const id = parseInt(key.slice(1))
        hexIndices = vertIdToHexes.get(id) ?? []
      } else if (key.startsWith('e')) {
        hexIndices = edgeToHexes.get(key.slice(1)) ?? []
      }

      // Rich description: terrain(number=Xdots) per adjacent hex
      const richHexDescs = hexIndices
        .filter(hi => TERRAIN_ORDER_CI[hi] !== 'desert' && NUMBERS_CI[hi] > 0)
        .map(hi => {
          const t = terrainNames[TERRAIN_ORDER_CI[hi]] ?? TERRAIN_ORDER_CI[hi]
          const n = NUMBERS_CI[hi]
          const dots = DOTS[n] ?? 0
          const isRobber = savedRobberHex === hi
          return `${t}(${n}=${dots}pts${isRobber ? ',LADRÓN' : ''})`
        })

      const totalDots = hexIndices
        .filter(hi => TERRAIN_ORDER_CI[hi] !== 'desert' && NUMBERS_CI[hi] > 0 && savedRobberHex !== hi)
        .reduce((acc, hi) => acc + (DOTS[NUMBERS_CI[hi]] ?? 0), 0)

      const desc = richHexDescs.length > 0
        ? `[${richHexDescs.join('+')}→${totalDots}pts/turno]`
        : '[sin producción]'

      if (piece.type === 'settlement') {
        byColor[c].settlements.push(desc)
        if (key.startsWith('v')) {
          const id = parseInt(key.slice(1))
          vertexProduction.set(id, { hexDescs: richHexDescs, dots: totalDots })
        }
      }
      else if (piece.type === 'city')  byColor[c].cities.push(desc + '×2')
      else if (piece.type === 'road')  byColor[c].roads.push(desc)
    }

    // Calculate total expected production per turn for each player
    const playerLines: string[] = []
    const playerOrder = savedAssignments.length > 0 ? savedAssignments : Object.keys(byColor)

    for (const color of playerOrder) {
      const s = byColor[color]
      if (!s) continue
      const label = colorNames[color] ?? color
      const isMe = color === savedMyColor

      // Resource diversity: which resources does this player produce?
      const myPieces = Object.entries(savedPieces).filter(([,p]) => p.color === color)
      const producedResources = new Set<string>()
      let totalProdPts = 0
      for (const [key] of myPieces) {
        const hexInds = key.startsWith('v')
          ? vertIdToHexes.get(parseInt(key.slice(1))) ?? []
          : edgeToHexes.get(key.slice(1)) ?? []
        for (const hi of hexInds) {
          if (TERRAIN_ORDER_CI[hi] !== 'desert' && NUMBERS_CI[hi] > 0 && savedRobberHex !== hi) {
            producedResources.add(terrainNames[TERRAIN_ORDER_CI[hi]] ?? TERRAIN_ORDER_CI[hi])
            totalProdPts += DOTS[NUMBERS_CI[hi]] ?? 0
          }
        }
      }

      const parts: string[] = []
      if (s.settlements.length > 0) parts.push(`${s.settlements.length} poblado${s.settlements.length>1?'s':''}: ${s.settlements.join(' y ')}`)
      if (s.cities.length > 0)      parts.push(`${s.cities.length} ciudad${s.cities.length>1?'es':''}: ${s.cities.join(' y ')}`)
      if (s.roads.length > 0)       parts.push(`${s.roads.length} camino${s.roads.length>1?'s':''}`)
      if (producedResources.size > 0) parts.push(`produce: ${[...producedResources].join('+')} (~${totalProdPts}pts/turno)`)

      if (parts.length > 0) playerLines.push(`${isMe ? `TU COLOR (${label})` : label}:\n  ${parts.join('\n  ')}`)
    }

    // Resources in hand
    const RES_ES: Record<string,string> = { wood:'madera', clay:'arcilla', cereal:'trigo', wool:'lana', mineral:'mineral' }
    const resourceLine = savedResources
      ? Object.entries(savedResources).filter(([,v]) => v > 0)
          .map(([k,v]) => `${RES_ES[k]||k}×${v}`).join(', ')
      : null

    // Robber context
    let robberLine = ''
    if (savedRobberHex !== 9) {
      const rTerrain = TERRAIN_ORDER_CI[savedRobberHex] ?? 'desconocido'
      const rNum = NUMBERS_CI[savedRobberHex] ?? 0
      robberLine = `\nLADRÓN: bloqueando ${terrainNames[rTerrain] ?? rTerrain}(${rNum}) — ese hex NO produce aunque salga su número`
    }

    let summary = `POSICIONES EN EL TABLERO:\n${playerLines.join('\n') || 'Sin piezas colocadas'}`
    if (resourceLine) summary += `\n\nRECURSOS EN MANO (${myLabel.toUpperCase()}): ${resourceLine}`
    if (robberLine) summary += robberLine

    return summary
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPieces, savedMyColor, savedAssignments, savedResources, savedRobberHex])
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

    // ── Detección de preguntas estratégicas sin recursos ─────────────────────
    // Si el usuario pregunta por jugadas/estrategia en modo coach con tablero
    // pero sin recursos guardados → interrumpir y pedir recursos primero
    const STRATEGY_KEYWORDS = ['mejor jugada','qué hago','qué construir','recomend','qué puedo hacer','mejor opción','siguiente paso']
    const isStrategyQuestion = coachMode && boardConfigured && !savedResources &&
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

    // ── Si hay tablero + modo coach pero sin GeneticRec fresco, consultar API ─
    // Esto ocurre cuando el usuario pregunta manualmente después de un dado
    let freshGeneticRec = savedGeneticRec
    if (coachMode && boardConfigured && savedResources && !savedGeneticRec) {
      try {
        const pieceKeys = Object.keys(savedPieces)
        const mySettlements = pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === savedMyColor && savedPieces[k].type === 'settlement').map(k => parseInt(k.slice(1)))
        const myCities      = pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === savedMyColor && savedPieces[k].type === 'city').map(k => parseInt(k.slice(1)))
        const myRoads       = pieceKeys.filter(k => k.startsWith('e') && savedPieces[k].color === savedMyColor).map(k => k.slice(1))
        const rivals = savedAssignments.filter(c => c !== savedMyColor).map(color => ({
          color,
          vp: pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === color && savedPieces[k].type === 'settlement').length
            + pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === color && savedPieces[k].type === 'city').length * 2,
          settlements: pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === color && savedPieces[k].type === 'settlement').map(k => parseInt(k.slice(1))),
          cities:      pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === color && savedPieces[k].type === 'city').map(k => parseInt(k.slice(1))),
          roads:       pieceKeys.filter(k => k.startsWith('e') && savedPieces[k].color === color).map(k => k.slice(1)),
          knights_played: 0,
        }))
        const vpBase  = mySettlements.length + myCities.length * 2
        const vpBonus = (savedLongestRoad ? 2 : 0) + (savedLargestArmy ? 2 : 0)
        const res = await fetch('/api/coach-recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resources: savedResources, settlements: mySettlements, cities: myCities, roads: myRoads,
            vp: vpBase + vpBonus, roadLength: myRoads.length,
            knightsPlayed: savedKnightsPlayed, longestRoad: savedLongestRoad, largestArmy: savedLargestArmy,
            otherPlayers: rivals, gamePhasePlaying: true, robberHex: savedRobberHex,
            turn: currentTurn,
          }),
        })
        if (res.ok) { freshGeneticRec = await res.json(); setSavedGeneticRec(freshGeneticRec) }
      } catch { /* GeneticAgent opcional */ }
    }

    // Build coachState: prefer explicit override, then derive from saved state
    const baseCoachState = boardConfigured ? {
      boardSummary: buildBoardSummary(),
      resources: savedResources,
      geneticRecommendation: freshGeneticRec,
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
    let boardRecommendation: import('@/src/domain/entities').BoardRecommendation | undefined

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
                    const cities      = pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === savedMyColor && savedPieces[k].type === 'city').map(k => parseInt(k.slice(1)))
                    const roads       = pieceKeys.filter(k => k.startsWith('e') && savedPieces[k].color === savedMyColor).map(k => k.slice(1))

                    // Build other_players from saved board state
                    const rivals = (savedAssignments.length > 0 ? savedAssignments : Object.keys(
                      Object.fromEntries(Object.values(savedPieces).map(p => [p.color, 1]))
                    )).filter(c => c !== savedMyColor)

                    const otherPlayers = rivals.map(color => ({
                      color,
                      vp: pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === color && savedPieces[k].type === 'settlement').length * 1
                        + pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === color && savedPieces[k].type === 'city').length * 2,
                      settlements: pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === color && savedPieces[k].type === 'settlement').map(k => parseInt(k.slice(1))),
                      cities:      pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === color && savedPieces[k].type === 'city').map(k => parseInt(k.slice(1))),
                      roads:       pieceKeys.filter(k => k.startsWith('e') && savedPieces[k].color === color).map(k => k.slice(1)),
                      knights_played: 0,  // unknown rival info — default 0
                    }))

                    const vpBase = settlements.length * 1 + cities.length * 2
                    const vpBonus = (savedLongestRoad ? 2 : 0) + (savedLargestArmy ? 2 : 0)

                    const apiRes = await fetch('/api/coach-recommend', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        resources: counts,
                        settlements, cities, roads,
                        vp: vpBase + vpBonus,
                        roadLength: roads.length,
                        knightsPlayed: savedKnightsPlayed,
                        longestRoad:   savedLongestRoad,
                        largestArmy:   savedLargestArmy,
                        otherPlayers,
                        gamePhasePlaying: true,
                        robberHex: savedRobberHex,
                      }),
                    })
                    if (apiRes.ok) { geneticRec = await apiRes.json(); setSavedGeneticRec(geneticRec) }
                  } catch { /* GeneticAgent optional — LLM works without it */ }

                  // 2. Build coachState — usar pendingBoardRef si está disponible
                  // (evita el problema de closure asíncrono con savedPieces)
                  const boardData = pendingBoardRef.current
                  const freshBoardSummary = boardData
                    ? buildBoardSummaryFromData(boardData.pieces, boardData.myColor, boardData.assignments, counts, boardData.robberHex)
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
                      const pieceKeys = Object.keys(savedPieces)
                      const mySettlements = pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === savedMyColor && savedPieces[k].type === 'settlement').map(k => parseInt(k.slice(1)))
                      const myCities      = pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === savedMyColor && savedPieces[k].type === 'city').map(k => parseInt(k.slice(1)))
                      const myRoads       = pieceKeys.filter(k => k.startsWith('e') && savedPieces[k].color === savedMyColor).map(k => k.slice(1))
                      const rivals        = savedAssignments.filter(c => c !== savedMyColor).map(color => ({
                        color,
                        vp: pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === color && savedPieces[k].type === 'settlement').length
                          + pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === color && savedPieces[k].type === 'city').length * 2,
                        settlements: pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === color && savedPieces[k].type === 'settlement').map(k => parseInt(k.slice(1))),
                        cities:      pieceKeys.filter(k => k.startsWith('v') && savedPieces[k].color === color && savedPieces[k].type === 'city').map(k => parseInt(k.slice(1))),
                        roads:       pieceKeys.filter(k => k.startsWith('e') && savedPieces[k].color === color).map(k => k.slice(1)),
                        knights_played: 0,
                      }))
                      const vpBase  = mySettlements.length + myCities.length * 2
                      const vpBonus = (savedLongestRoad ? 2 : 0) + (savedLargestArmy ? 2 : 0)
                      const apiRes = await fetch('/api/coach-recommend', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          resources:     diceResult.newTotals,
                          settlements:   mySettlements,
                          cities:        myCities,
                          roads:         myRoads,
                          vp:            vpBase + vpBonus,
                          roadLength:    myRoads.length,
                          knightsPlayed: savedKnightsPlayed,
                          longestRoad:   savedLongestRoad,
                          largestArmy:   savedLargestArmy,
                          otherPlayers:  rivals,
                          gamePhasePlaying: true,
                          robberHex:     savedRobberHex,
                          turn:          currentTurn,
                          devCards:      savedDevCards,
                        }),
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
