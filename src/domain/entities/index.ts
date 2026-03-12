export type UserLevel = 'beginner' | 'intermediate' | 'advanced'
export type AgentUsed = 'rules' | 'strategy' | 'direct'
export type RouteDecision = 'rules' | 'strategy' | 'direct'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  agentUsed?: AgentUsed
  suggestedQuestions?: string[]
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

export function createEmptySession(): Session {
  return {
    messages: [],
    conceptMap: { topics: {}, lastUpdated: Date.now() },
    userLevel: 'beginner',
    startedAt: Date.now(),
    lastActiveAt: Date.now(),
  }
}
