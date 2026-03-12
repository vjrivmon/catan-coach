import type { RouteDecision } from '../domain/entities'

const RULES_KEYWORDS = [
  'cómo', 'cuándo', 'qué es', 'cuántos', 'regla', 'turno', 'componente',
  'hexágono', 'número', 'dado', 'ladrón', 'banco', 'puerto', 'construcción',
  'costar', 'materiales', 'recurso', 'carta', 'robar', 'colocar', 'preparar',
  'empezar', 'inicio', 'ganar', 'victoria', 'puntos', 'ciudad', 'poblado',
  'camino', 'intercambio', 'comerciar', 'jugar', 'funciona', 'permite',
  'puedo', 'debo', 'permitido', 'reglamento', 'norma', 'fase',
]

const STRATEGY_KEYWORDS = [
  'estrategia', 'mejor', 'óptimo', 'recomiendan', 'aconsejas', 'consejo',
  'debería', 'conviene', 'ventaja', 'ganar más', 'mejorar', 'ayuda',
  'trucos', 'tips', 'clave', 'errores', 'evitar', 'prioridad', 'primero',
  'importante', 'experto', 'avanzado', 'técnica', 'táctica', 'plan',
]

const CONVERSATIONAL_KEYWORDS = [
  'hola', 'gracias', 'ok', 'entendido', 'vale', 'perfecto', 'genial',
  'buenas', 'hey', 'qué tal', 'ayuda', 'ayúdame',
]

export class RouterAgent {
  classify(message: string): RouteDecision {
    const lower = message.toLowerCase()

    // Conversational/direct
    const isConversational = CONVERSATIONAL_KEYWORDS.some(kw => lower.includes(kw))
    if (isConversational && message.length < 30) return 'direct'

    // Score rules vs strategy
    const rulesScore = RULES_KEYWORDS.filter(kw => lower.includes(kw)).length
    const strategyScore = STRATEGY_KEYWORDS.filter(kw => lower.includes(kw)).length

    if (strategyScore > rulesScore) return 'strategy'
    if (rulesScore > 0) return 'rules'

    // Default: try rules for unknown questions about the game
    return 'rules'
  }
}
