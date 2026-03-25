import type { Message, UserLevel } from '../entities'

// Vocabulario técnico-avanzado: términos que solo usa alguien que ya controla
const ADVANCED_KEYWORDS = [
  'pip', 'pips', 'probabilidad', 'ratio', 'meta', 'control de mesa',
  'monopolio óptimo', 'bloqueo', 'tempo', 'ejército más grande',
  'camino más largo', 'año de prosperidad', 'estrategia avanzada',
  'equity', 'expected value', 'diversificación', 'port', 'puerto 2:1',
  'colocación óptima', 'secuencia de construcción', 'gestión de recursos',
]

// Vocabulario intermedio: estrategia básica, mecánicas no triviales
const INTERMEDIATE_KEYWORDS = [
  'estrategia', 'óptimo', 'cuándo construir', 'prioridad',
  'caballero', 'carta de desarrollo', 'colocación inicial',
  'intercambio marítimo', 'negociación', 'cuándo comprar',
  'mejor momento', 'producción', 'expandirme', 'bloquear',
  'rival', 'rivales', 'puntos de victoria', 'cuántos puntos',
]

// Preguntas muy básicas que indican principiante aunque haya muchos mensajes
const BEGINNER_INDICATORS = [
  'cómo se juega', 'qué son los', 'para qué sirve', 'qué significa',
  'no entiendo', 'puedo construir', 'cuánto cuesta', 'qué necesito',
  'cómo funciona', 'qué es un', 'qué es la',
]

// Penalización: si sigue preguntando cosas muy básicas, no subir de nivel
function hasManyBasicQuestions(msgs: string[]): boolean {
  const basicCount = msgs.filter(m =>
    BEGINNER_INDICATORS.some(kw => m.includes(kw))
  ).length
  return basicCount >= 2
}

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

    // Complejidad media de los mensajes (palabras por pregunta)
    const avgWords = userMessages.reduce((sum, m) => sum + m.split(/\s+/).length, 0) / userMessages.length
    if (avgWords > 15) intermediateScore += 1  // preguntas largas → algo de experiencia
    if (avgWords > 25) advancedScore += 1       // preguntas muy elaboradas → avanzado

    // Penalización: si sigue haciendo preguntas muy básicas, no subir de nivel
    if (hasManyBasicQuestions(userMessages)) {
      advancedScore = 0
      intermediateScore = Math.max(0, intermediateScore - 2)
    }

    // Bonus por número de mensajes — mucho más conservador que antes
    // Solo añade +1 a intermedio cada 10 mensajes (antes era cada 5)
    const messageBonus = Math.floor(userMessages.length / 10)
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
