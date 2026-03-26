import { NextRequest } from 'next/server'
import { debugLog } from '@/src/lib/debugLog'
import { RouterAgent } from '@/src/agents/RouterAgent'
import { RulesAgent } from '@/src/agents/RulesAgent'
import { StrategyAgent } from '@/src/agents/StrategyAgent'
import { SuggestionAgent, type CoachState } from '@/src/agents/SuggestionAgent'
import { computeBoardContext, computeTurnsEstimate } from '@/src/agents/BoardStateAgent'
import { buildRecommendation, type GeneticResult } from '@/src/agents/BoardRecommendationBuilder'
import { NarratorAgent } from '@/src/agents/NarratorAgent'
import { OllamaAdapter } from '@/src/adapters/outbound/OllamaAdapter'
import { ChromaAdapter } from '@/src/adapters/outbound/ChromaAdapter'
import type { Message, UserLevel } from '@/src/domain/entities'
import { config } from '@/src/config'

/** Detect if a message is asking about turn count / resource accumulation */
function isTurnsQuestion(msg: string): boolean {
  const lower = msg.toLowerCase()
  return (
    (lower.includes('turno') || lower.includes('cuánto tarda') || lower.includes('cuándo podré')) &&
    (lower.includes('ciudad') || lower.includes('poblado') || lower.includes('camino') || lower.includes('carta') || lower.includes('acumul') || lower.includes('recurso'))
  )
}

/** Detect if user claims to have resources they don't have according to coachState */
function detectResourceContradiction(
  msg: string,
  resources: Record<string, number> | null | undefined
): string | null {
  if (!resources) return null
  const lower = msg.toLowerCase()

  const claimPatterns = [
    { re: /tengo (\d+) (?:de )?mineral/i, key: 'mineral' },
    { re: /tengo (\d+) (?:de )?madera/i, key: 'wood' },
    { re: /tengo (\d+) (?:de )?arcilla/i, key: 'clay' },
    { re: /tengo (\d+) (?:de )?ladrillo/i, key: 'clay' },
    { re: /tengo (\d+) (?:de )?trigo/i, key: 'cereal' },
    { re: /tengo (\d+) (?:de )?cereal/i, key: 'cereal' },
    { re: /tengo (\d+) (?:de )?lana/i, key: 'wool' },
  ]

  for (const { re, key } of claimPatterns) {
    const match = lower.match(re)
    if (match) {
      const claimed = parseInt(match[1])
      const actual = resources[key] ?? 0
      if (claimed !== actual) {
        const RES_ES: Record<string, string> = { mineral: 'Mineral', wood: 'Madera', clay: 'Arcilla', cereal: 'Trigo', wool: 'Lana' }
        return `⚠️ CORRECCIÓN: El usuario dice tener ${claimed} de ${RES_ES[key]}, pero según el tablero actual tiene ${actual}. Corrige amablemente esta discrepancia en tu respuesta.`
      }
    }
  }
  return null
}

const router = new RouterAgent()
const mainAdapter = new OllamaAdapter(config.ollama.mainModel)
const coachAdapter = new OllamaAdapter(config.ollama.coachModel)
const suggestionAdapter = new OllamaAdapter(config.ollama.suggestionModel)
const chromaAdapter = new ChromaAdapter()
const rulesAgent = new RulesAgent(chromaAdapter, mainAdapter)
const strategyAgent = new StrategyAgent(chromaAdapter, mainAdapter)
const aprendeNarrator = new NarratorAgent(mainAdapter)
const coachNarrator = new NarratorAgent(coachAdapter)
const suggestionAgent = new SuggestionAgent(suggestionAdapter)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message, history, userLevel, seenConcepts, coachState, mode } = body as {
      message: string
      history: Message[]
      userLevel: UserLevel
      seenConcepts: string[]
      coachState?: CoachState
      mode?: 'aprende' | 'coach'
    }

    // Log incoming request
    debugLog.chatRequest({ message: (message ?? '').slice(0,100), mode: mode ?? 'aprende', userLevel: userLevel ?? 'beginner', coachState: coachState ? { boardSummary: ((coachState as any)?.boardSummary ?? '').slice(0,100), hasGenetic: !!(coachState as any)?.geneticRecommendation, resources: (coachState as any)?.resources } : null })

    // Strict separation: aprende mode never gets coach state
    const activeCoachState = mode === 'coach' ? coachState : undefined

    // Filter history: remove system messages and truncate
    const SYSTEM_MSG_PATTERNS = [
      /^Tablero (configurado|actualizado|listo)/,
      /^Recursos confirmados:/,
      /^Cartas:/,
      /^Sin cartas de desarrollo/,
      /^Tablero recibido/,
    ]
    const cleanHistory = history
      .filter(m => !SYSTEM_MSG_PATTERNS.some(p => p.test(m.content)))
      .slice(-4)

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'Mensaje vacío' }), { status: 400 })
    }

    // 1. Route the question
    const route = router.classify(message)

    // 2. Compute board context FIRST (PURE CODE, 0 LLM, instant)
    const boardContext = computeBoardContext(activeCoachState)

    // 3. Retrieve context (RAG) + start suggestions in parallel
    const [context, suggestedQuestions] = await Promise.all([
      route === 'rules'
        ? rulesAgent.retrieve(message)
        : route === 'strategy'
          ? strategyAgent.retrieve(message)
          : Promise.resolve(''),
      suggestionAgent.suggest(message, cleanHistory, userLevel,
        activeCoachState ? {
          ...activeCoachState,
          ...(boardContext ? {
            productionTable: boardContext.productionTable,
            vpSummary: boardContext.vpSummary,
            actions: boardContext.actions,
          } : {}),
        } : undefined
      ),
    ])

    // ================================================================
    // BoardRecommendationBuilder → NarratorAgent
    // ================================================================

    // 4. Build recommendation from genetic result (PURE CODE, 0 LLM)
    const geneticResult = activeCoachState?.geneticRecommendation as GeneticResult | null | undefined
    debugLog.systemPrompt(`[BoardRecommendationBuilder] geneticResult: ${JSON.stringify(geneticResult)}`)
    const builderResult = boardContext
      ? buildRecommendation(geneticResult, boardContext)
      : null
    debugLog.systemPrompt(`[BoardRecommendationBuilder] builderResult: ${JSON.stringify(builderResult)}`)

    // 5. Detect if question asks for a recommendation (best move)
    const isRecommendationQ = (() => {
      const lower = message.toLowerCase()
      return /mejor jugada|qué construir|qu[eé] deber[ií]a|qu[eé] hago|qu[eé] puedo hacer|mejor opci[oó]n|recomend/i.test(lower)
    })()

    // 6. Stream the response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        try {
          let fullResponse = ''

          if (boardContext && builderResult && isRecommendationQ) {
            // ── COACH: pregunta de recomendación → narrar la jugada ──
            let extraContext = ''
            if (isTurnsQuestion(message) && activeCoachState?.boardSummary) {
              const estimate = computeTurnsEstimate(activeCoachState.boardSummary, activeCoachState.resources ?? null)
              if (estimate) extraContext += `RESPUESTA PRE-CALCULADA:\n${estimate}\n`
            }
            const resourceCorrection = detectResourceContradiction(message, activeCoachState?.resources)
            if (resourceCorrection) extraContext += resourceCorrection + '\n'

            const augmentedBuilder = extraContext
              ? { ...builderResult, reason: `${extraContext}${builderResult.reason}` }
              : builderResult

            for await (const token of coachNarrator.narrateCoach(
              message,
              augmentedBuilder,
              boardContext,
              userLevel,
              cleanHistory,
            )) {
              fullResponse += token
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', token })}\n\n`))
            }
          } else {
            // ── Pregunta libre (aprende, reglas, estrategia, o coach sin recomendación) ──
            // Si estamos en coach mode, inyectar contexto del tablero como background
            const boardBackground = boardContext
              ? `Estado actual del tablero:\n${boardContext.resourceLine}\n${boardContext.vpSummary}\n${boardContext.productionTable}\nAcciones posibles: ${boardContext.actions}\n`
              : ''
            const finalContext = [
              detectResourceContradiction(message, activeCoachState?.resources),
              boardBackground,
              context,
            ].filter(Boolean).join('\n')

            // En coach mode usa el modelo rápido, en aprende el de calidad
            const narrator = activeCoachState ? coachNarrator : aprendeNarrator
            for await (const token of narrator.narrateSimple(
              message,
              finalContext,
              userLevel,
              cleanHistory,
            )) {
              fullResponse += token
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', token })}\n\n`))
            }
          }

          // Board recommendation only for recommendation questions
          const finalRecommendation = isRecommendationQ ? (builderResult?.boardRecommendation ?? null) : null

          // Send suggestions, metadata, and optional board recommendation
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'done',
              suggestedQuestions,
              agentUsed: route,
              ...(finalRecommendation ? { boardRecommendation: finalRecommendation } : {}),
            })}\n\n`)
          )
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Error desconocido'
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`)
          )
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (err) {
    console.error('[/api/chat] error:', err)
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { status: 500 }
    )
  }
}
