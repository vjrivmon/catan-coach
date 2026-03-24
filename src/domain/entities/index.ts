export type UserLevel = 'beginner' | 'intermediate' | 'advanced'
export type AgentUsed = 'rules' | 'strategy' | 'direct'
export type RouteDecision = 'rules' | 'strategy' | 'direct'

export interface BoardRecommendation {
  type: 'road' | 'settlement' | 'city'
  position: string   // "v54" o "e12_34"
  label: string      // descripción humana: "mineral(10)+trigo(12)"
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  agentUsed?: AgentUsed
  suggestedQuestions?: string[]
  boardRecommendation?: BoardRecommendation   // Fase 1: posición concreta extraída del LLM
}

export interface ConceptMap {
  topics: Record<string, { seen: boolean; timesDiscussed: number; lastSeen: number }>
  lastUpdated: number
}

export interface Session {
  messages: Message[]
  conceptMap: ConceptMap
  userLevel: UserLevel
  startedAt: number
  lastActiveAt: number
}

export const CATAN_CONCEPTS = [
  'colocación inicial',
  'recursos',
  'dados',
  'ladrón',
  'comercio',
  'puertos',
  'caminos',
  'poblados',
  'ciudades',
  'cartas de desarrollo',
  'caballero',
  'ejército',
  'puntos de victoria',
  'negociación',
  'estrategia',
]

export interface BoardState {
  pieces:      Record<string, { type: 'settlement' | 'city' | 'road'; color: string }>
  myColor:     string
  assignments: string[]
  resources:   Record<string, number> | null
  robberHex:   number
  devCards:    Record<string, number> | null
  gameStarted: boolean
  currentTurn: number
  coachMode:   boolean
  hasSelectedMode: boolean
  longestRoad: boolean
  largestArmy: boolean
  knightsPlayed: number
  ports?: string[]   // PortType[] — ports the player has access to
}

export interface Conversation {
  id: string
  title: string        // primer mensaje del usuario, truncado
  session: Session
  boardState?: BoardState   // estado del tablero persistido por conversación
  createdAt: number
  lastActiveAt: number
}

export function createEmptySession(): Session {
  return {
    messages: [],
    conceptMap: { topics: {}, lastUpdated: Date.now() },
    userLevel: 'beginner',
    startedAt: Date.now(),
    lastActiveAt: Date.now(),
  }
}
