/**
 * NarratorAgent — LLM con prompt MINIMO
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
import { debugLog } from '../lib/debugLog'
import { config } from '../config'

const LEVEL_INSTRUCTIONS: Record<UserLevel, string> = {
  beginner: `Nivel principiante. Responde en EXACTAMENTE 3 frases simples.
Frase 1: QUE construir y su coste exacto.
Frase 2: HACIA DONDE expandirte con terrenos concretos.
Frase 3: UNA razon estrategica.
NO uses IDs de vertice (v15, e12_34). Usa nombres de terrenos. NO termines con pregunta.`,

  intermediate: `Nivel intermedio. Maximo 4 frases directas.
No uses IDs de vertice. Usa descripcion de terrenos.
Da la mejor jugada con coste y una alternativa si existe.`,

  advanced: `Nivel avanzado. Maximo 6-8 frases con analisis estrategico denso.
Puedes usar IDs de vertice si los acompañas de la descripcion del terreno.
Incluye alternativas y razonamiento de probabilidades.`,
}

const SYSTEM_PROMPT = `Eres Catan Coach. Explica la siguiente recomendacion en español de forma natural y directa.
El juego se llama CATAN. Nunca uses "El Colonizador" ni "Los Colonos de Catan".
PROHIBIDO: mencionar "agente genetico", "algoritmo", "IA", "sistema de analisis" o como se calcula la recomendacion.
Presenta la recomendacion como tuya, natural y directa.
Responde SIEMPRE en español. Sin emojis.`

const SIMPLE_SYSTEM_PROMPT = `Eres Catan Coach, asistente experto en el juego de mesa Catan (juego base, en español).
El juego se llama CATAN. Nunca uses "El Colonizador" ni "Los Colonos de Catan".

COSTES DE CONSTRUCCION (NO negociables):
- Camino: 1 Arcilla + 1 Madera
- Poblado: 1 Arcilla + 1 Madera + 1 Lana + 1 Trigo
- Ciudad: 3 Mineral + 2 Trigo
- Carta desarrollo: 1 Mineral + 1 Lana + 1 Trigo

Responde SIEMPRE en español. Sin emojis. Si hay contexto relevante del reglamento, usalo como fuente de verdad.`

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

  const dataBlock = `ACCION RECOMENDADA: ${builderResult.actionEs}
HACIA: ${builderResult.positionDescription || 'sin posicion especifica'}
RAZON: ${builderResult.reason}
RECURSOS NECESARIOS: ${builderResult.costDescription}
EL JUGADOR TIENE: ${boardContext.resourceLine}
PUEDE EJECUTAR: ${builderResult.canExecute ? 'SI' : 'NO — recomienda comerciar o pasar turno'}
VP ACTUALES: ${boardContext.vpSummary}
PRODUCCION: ${boardContext.productionTable}
${boardContext.turnsEstimate ? boardContext.turnsEstimate + '\n' : ''}ACCIONES POSIBLES:
${boardContext.actions}`

  return `${LEVEL_INSTRUCTIONS[level]}

${dataBlock}

${historyText ? `Historial reciente:\n${historyText}\n\n` : ''}Pregunta del usuario: ${message}

Explica la recomendacion respondiendo a la pregunta del usuario. Usa los datos exactos proporcionados arriba. No inventes recursos ni posiciones.`
}

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

export class NarratorAgent {
  constructor(private llm: LLMPort) {}

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

    yield* this.llm.generateStream(userPrompt, systemPrompt)
  }

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

    yield* this.llm.generateStream(userPrompt, systemPrompt)
  }
}
