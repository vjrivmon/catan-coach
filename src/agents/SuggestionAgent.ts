import type { LLMPort } from '../domain/ports'
import type { Message, UserLevel } from '../domain/entities'

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
      frontier: string[]
    }
  } | null
  turn?: number | null
  devCards?: Record<string, number> | null
}

const SYSTEM_PROMPT = 'Genera sugerencias de preguntas sobre Catan en español. Responde SOLO con un array JSON.'

export class SuggestionAgent {
  constructor(private llm: LLMPort) {}

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
${coachState!.resources ? `Recursos del jugador: ${Object.entries(coachState!.resources).filter(([,v])=>v>0).map(([k,v])=>`${k}x${v}`).join(', ') || 'ninguno'}` : ''}

Ultima interaccion: ${message || 'El jugador acaba de configurar su tablero'}

Genera exactamente 3 preguntas/acciones que el jugador podria querer consultar ahora.
Deben ser CONCRETAS al estado del tablero: posibles jugadas, calculo de probabilidades, uso de puertos, expansion, bloqueo, intercambio.
Devuelve SOLO un array JSON valido: ["pregunta1", "pregunta2", "pregunta3"]
Sin explicaciones, solo el array JSON.`
      : `Historial reciente sobre Catan:
${recentHistory}

Ultima pregunta del usuario (nivel ${levelLabel}): ${message}

Genera exactamente 3 preguntas de seguimiento en español que el usuario podria querer hacer a continuacion.
Las preguntas deben: (1) profundizar en el tema actual, (2) explorar un tema relacionado, (3) anticipar el siguiente concepto logico.
Devuelve SOLO un array JSON valido: ["pregunta1", "pregunta2", "pregunta3"]
Sin explicaciones adicionales, solo el array JSON.`

    try {
      const text = await this.llm.generate(prompt, SYSTEM_PROMPT)

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
      '¿Cual es mi mejor jugada en este turno?',
      '¿Me conviene usar el puerto para intercambiar ahora?',
      '¿Donde debo expandir para maximizar mis puntos?',
    ]
  }

  private fallbackSuggestions(level: UserLevel): string[] {
    if (level === 'beginner') return [
      '¿Como funciona el turno en Catan?',
      '¿Cuales son los recursos del juego?',
      '¿Como se gana en Catan?',
    ]
    if (level === 'intermediate') return [
      '¿Cuando conviene priorizar ciudades sobre nuevos poblados?',
      '¿Como funciona el intercambio maritimo?',
      '¿Cual es la mejor estrategia de colocacion inicial?',
    ]
    return [
      '¿Como calcular la probabilidad de produccion en la colocacion inicial?',
      '¿Cuando usar el Monopolio para mayor impacto?',
      '¿Como bloquear al lider sin perjudicarte a ti mismo?',
    ]
  }
}
