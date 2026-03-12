import type { Message, UserLevel } from '../entities'

const ADVANCED_KEYWORDS = [
  'pip', 'pips', 'probabilidad', 'ratio', 'meta', 'control de mesa',
  'monopolio óptimo', 'bloqueo', 'tempo', 'ejército más grande',
  'camino más largo', 'año de prosperidad', 'estrategia avanzada',
]

const INTERMEDIATE_KEYWORDS = [
  'estrategia', 'óptimo', 'cuándo construir', 'prioridad',
  'puerto 2:1', 'caballero', 'carta de desarrollo', 'camino más largo',
  'colocación inicial', 'intercambio marítimo', 'negociación',
]

export class LevelDetector {
  detect(history: Message[]): UserLevel {
    const userMessages = history
      .filter(m => m.role === 'user')
      .map(m => m.content.toLowerCase())

    if (userMessages.length === 0) return 'beginner'

    let advancedScore = 0
    let intermediateScore = 0

    for (const msg of userMessages) {
      for (const kw of ADVANCED_KEYWORDS) {
        if (msg.includes(kw)) advancedScore++
      }
      for (const kw of INTERMEDIATE_KEYWORDS) {
        if (msg.includes(kw)) intermediateScore++
      }
    }

    // Also factor in message count (more questions = more experience)
    const messageBonus = Math.floor(userMessages.length / 5)
    intermediateScore += messageBonus

    if (advancedScore >= 2) return 'advanced'
    if (intermediateScore >= 3 || advancedScore >= 1) return 'intermediate'
    return 'beginner'
  }

  getLevelLabel(level: UserLevel): string {
    switch (level) {
      case 'beginner': return 'principiante'
      case 'intermediate': return 'intermedio'
      case 'advanced': return 'avanzado'
    }
  }
}
