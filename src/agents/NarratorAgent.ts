/**
 * NarratorAgent — LLM con prompt MÍNIMO
 *
 * Recibe datos pre-computados (BoardContext + BuilderResult) y los narra
 * en español al nivel del usuario. NO decide, NO calcula, solo explica.
 *
 * System prompt ~100 tokens. User prompt con datos concretos.
 */

import type { LLMPort } from '../domain/ports'
import type { Message, UserLevel } from '../domain/entities'
import type { BoardContext } from './BoardStateAgent'
import type { BuilderResult } from './BoardRecommendationBuilder'
import { config } from '../config'
import { debugLog } from '../lib/debugLog'

const LEVEL_INSTRUCTIONS: Record<UserLevel, string> = {
  beginner: `Nivel principiante. Responde en EXACTAMENTE 3 frases simples.
Frase 1: QUÉ construir y su coste exacto.
Frase 2: HACIA DÓNDE expandirte con terrenos concretos.
Frase 3: UNA razón estratégica.
NO uses IDs de vértice (v15, e12_34). Usa nombres de terrenos. NO termines con pregunta.`,

  intermediate: `Nivel intermedio. Máximo 4 frases directas.
No uses IDs de vértice. Usa descripción de terrenos.
Da la mejor jugada con coste y una alternativa si existe.`,

  advanced: `Nivel avanzado. Máximo 6-8 frases con análisis estratégico denso.
Puedes usar IDs de vértice si los acompañas de la descripción del terreno.
Incluye alternativas y razonamiento de probabilidades.`,
}

const SYSTEM_PROMPT = `Eres Catan Coach. Explica la siguiente recomendación en español de forma natural y directa.
El juego se llama CATAN. Nunca uses "El Colonizador" ni "Los Colonos de Catán".
PROHIBIDO: mencionar "agente genético", "algoritmo", "IA", "sistema de análisis" o cómo se calcula la recomendación.
Presenta la recomendación como tuya, natural y directa.
Responde SIEMPRE en español. Sin emojis.`

/**
 * Build the user prompt with all pre-computed data for the narrator.
 */
function buildNarratorPrompt(
  message: string,
  builderResult: BuilderResult,
  boardContext: BoardContext,
  level: UserLevel,
  history: Message[],
): string {
  const historyText = history.slice(-4).map(m =>
    `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`
  ).join('\n')

  const dataBlock = `ACCIÓN RECOMENDADA: ${builderResult.actionEs}
HACIA: ${builderResult.positionDescription || 'sin posición específica'}
RAZÓN: ${builderResult.reason}
RECURSOS NECESARIOS: ${builderResult.costDescription}
EL JUGADOR TIENE: ${boardContext.resourceLine}
PUEDE EJECUTAR: ${builderResult.canExecute ? 'SÍ' : 'NO — recomienda comerciar o pasar turno'}
VP ACTUALES: ${boardContext.vpSummary}
PRODUCCIÓN: ${boardContext.productionTable}
${boardContext.turnsEstimate ? boardContext.turnsEstimate + '\n' : ''}ACCIONES POSIBLES:
${boardContext.actions}`

  return `${LEVEL_INSTRUCTIONS[level]}

${dataBlock}

${historyText ? `Historial reciente:\n${historyText}\n\n` : ''}Pregunta del usuario: ${message}

Explica la recomendación respondiendo a la pregunta del usuario. Usa los datos exactos proporcionados arriba. No inventes recursos ni posiciones.`
}

/**
 * Build prompt for non-coach mode (rules/strategy questions).
 */
function buildSimpleNarratorPrompt(
  message: string,
  context: string,
  level: UserLevel,
  history: Message[],
): string {
  const historyText = history.slice(-4).map(m =>
    `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`
  ).join('\n')

  return `${LEVEL_INSTRUCTIONS[level]}

${context ? `Contexto relevante del reglamento/estrategia:\n${context}\n\n` : ''}${historyText ? `Historial reciente:\n${historyText}\n\n` : ''}Pregunta actual: ${message}`
}

const SIMPLE_SYSTEM_PROMPT = `Eres Catan Coach, asistente experto en el juego de mesa Catan (juego base, en español).
El juego se llama CATAN. Nunca uses "El Colonizador" ni "Los Colonos de Catán".

COSTES DE CONSTRUCCIÓN (NO negociables):
- Camino: 1 Arcilla + 1 Madera
- Poblado: 1 Arcilla + 1 Madera + 1 Lana + 1 Trigo
- Ciudad: 3 Mineral + 2 Trigo
- Carta desarrollo: 1 Mineral + 1 Lana + 1 Trigo

Responde SIEMPRE en español. Sin emojis. Si hay contexto relevante del reglamento, úsalo como fuente de verdad.`

export class NarratorAgent {
  constructor(private llm: LLMPort) {}

  /**
   * Stream narration for coach mode with pre-computed data.
   */
  async *narrateCoach(
    message: string,
    builderResult: BuilderResult,
    boardContext: BoardContext,
    level: UserLevel,
    history: Message[],
  ): AsyncIterable<string> {
    const systemPrompt = SYSTEM_PROMPT
    const userPrompt = buildNarratorPrompt(message, builderResult, boardContext, level, history)

    debugLog.systemPrompt(`[NarratorAgent:coach] ${systemPrompt}\n\n${userPrompt}`)
    debugLog.llmStart(config.ollama.mainModel)

    yield* this.streamOllama(systemPrompt, userPrompt)
  }

  /**
   * Stream narration for non-coach mode (rules/strategy).
   */
  async *narrateSimple(
    message: string,
    context: string,
    level: UserLevel,
    history: Message[],
  ): AsyncIterable<string> {
    const systemPrompt = SIMPLE_SYSTEM_PROMPT
    const userPrompt = buildSimpleNarratorPrompt(message, context, level, history)

    debugLog.systemPrompt(`[NarratorAgent:simple] ${systemPrompt}\n\n${userPrompt}`)
    debugLog.llmStart(config.ollama.mainModel)

    yield* this.streamOllama(systemPrompt, userPrompt)
  }

  private async *streamOllama(systemPrompt: string, userPrompt: string): AsyncIterable<string> {
    const ollamaUrl = `${config.ollama.baseUrl}/api/generate`
    const body = JSON.stringify({
      model: config.ollama.mainModel,
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      stream: true,
    })

    const response = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    if (!response.ok || !response.body) {
      throw new Error(`Ollama error: ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          if (parsed.response) yield parsed.response
          if (parsed.done) return
        } catch { /* ignore parse errors */ }
      }
    }
  }
}
