import type { Message, UserLevel } from '../domain/entities'
import { config } from '../config'

export interface CoachState {
  boardSummary: string
  resources: Record<string, number> | null
  geneticRecommendation?: {
    action: string
    actionEs: string
    score: number
    reason: string
    alternatives: Array<{ action: string; actionEs: string; score: number; reason: string }>
    positionContext?: {
      mySettlements: string[]
      myRoads: string[]
      frontier: string[]  // vértices de expansión con descripción de terrenos adyacentes
    }
  } | null
  turn?: number | null
  devCards?: Record<string, number> | null
}

export class SuggestionAgent {
  async suggest(
    message: string,
    history: Message[],
    level: UserLevel,
    coachState?: CoachState,
  ): Promise<string[]> {
    const levelLabel = level === 'beginner' ? 'principiante' : level === 'intermediate' ? 'intermedio' : 'avanzado'
    const recentHistory = history.slice(-4).map(m =>
      `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content.slice(0, 200)}`
    ).join('\n')

    const isCoach = !!coachState?.boardSummary

    const prompt = isCoach
      ? `Eres un asistente de Catan en modo Coach en partida.

Estado actual del tablero: ${coachState!.boardSummary}
${coachState!.resources ? `Recursos del jugador: ${Object.entries(coachState!.resources).filter(([,v])=>v>0).map(([k,v])=>`${k}×${v}`).join(', ') || 'ninguno'}` : ''}

Última interacción: ${message || 'El jugador acaba de configurar su tablero'}

Genera exactamente 3 preguntas/acciones que el jugador podría querer consultar ahora.
Deben ser CONCRETAS al estado del tablero: posibles jugadas, cálculo de probabilidades, uso de puertos, expansión, bloqueo, intercambio.
Devuelve SOLO un array JSON válido: ["pregunta1", "pregunta2", "pregunta3"]
Sin explicaciones, solo el array JSON.`
      : `Historial reciente sobre Catan:
${recentHistory}

Última pregunta del usuario (nivel ${levelLabel}): ${message}

Genera exactamente 3 preguntas de seguimiento en español que el usuario podría querer hacer a continuación.
Las preguntas deben: (1) profundizar en el tema actual, (2) explorar un tema relacionado, (3) anticipar el siguiente concepto lógico.
Devuelve SOLO un array JSON válido: ["pregunta1", "pregunta2", "pregunta3"]
Sin explicaciones adicionales, solo el array JSON.`

    try {
      const response = await fetch(`${config.ollama.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.ollama.suggestionModel,
          messages: [
            { role: 'system', content: 'Genera sugerencias de preguntas sobre Catan en español. Responde SOLO con un array JSON.' },
            { role: 'user',   content: prompt },
          ],
          stream: false,
        }),
      })

      if (!response.ok) return this.fallbackSuggestions(level)

      const data = await response.json()
      const text: string = data.message?.content || ''

      // Extract JSON array from response
      const match = text.match(/\[[\s\S]*?\]/)
      if (!match) return this.fallbackSuggestions(level)

      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed) && parsed.length >= 2) {
        return parsed.slice(0, 3).map((q: unknown) => String(q))
      }

      return isCoach ? this.fallbackCoachSuggestions() : this.fallbackSuggestions(level)
    } catch {
      return isCoach ? this.fallbackCoachSuggestions() : this.fallbackSuggestions(level)
    }
  }

  private fallbackCoachSuggestions(): string[] {
    return [
      '¿Cuál es mi mejor jugada en este turno?',
      '¿Me conviene usar el puerto para intercambiar ahora?',
      '¿Dónde debo expandir para maximizar mis puntos?',
    ]
  }

  private fallbackSuggestions(level: UserLevel): string[] {
    if (level === 'beginner') return [
      '¿Cómo funciona el turno en Catan?',
      '¿Cuáles son los recursos del juego?',
      '¿Cómo se gana en Catan?',
    ]
    if (level === 'intermediate') return [
      '¿Cuándo conviene priorizar ciudades sobre nuevos poblados?',
      '¿Cómo funciona el intercambio marítimo?',
      '¿Cuál es la mejor estrategia de colocación inicial?',
    ]
    return [
      '¿Cómo calcular la probabilidad de producción en la colocación inicial?',
      '¿Cuándo usar el Monopolio para mayor impacto?',
      '¿Cómo bloquear al líder sin perjudicarte a ti mismo?',
    ]
  }
}
