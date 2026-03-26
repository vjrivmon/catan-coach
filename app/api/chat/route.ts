import { NextRequest } from 'next/server'
import { debugLog } from '@/src/lib/debugLog'
import { RouterAgent } from '@/src/agents/RouterAgent'
import { RulesAgent } from '@/src/agents/RulesAgent'
import { StrategyAgent } from '@/src/agents/StrategyAgent'
import { GeneratorAgent, extractRecommendation, stripNonLatinArtifacts, computeTurnsEstimatePublic } from '@/src/agents/GeneratorAgent'
import { SuggestionAgent, type CoachState } from '@/src/agents/SuggestionAgent'
import { OllamaAdapter } from '@/src/adapters/outbound/OllamaAdapter'
import { ChromaAdapter } from '@/src/adapters/outbound/ChromaAdapter'
import type { Message, UserLevel } from '@/src/domain/entities'

/** Detect if a message is asking about turn count / resource accumulation */
function isTurnsQuestion(msg: string): boolean {
  const lower = msg.toLowerCase()
  return (
    (lower.includes('turno') || lower.includes('turno') || lower.includes('cuánto tarda') || lower.includes('cuándo podré')) &&
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

  // Patterns: "tengo X de mineral", "tengo X mineral", "con mis X mineral"
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
const ollamaAdapter = new OllamaAdapter()
const chromaAdapter = new ChromaAdapter()
const rulesAgent = new RulesAgent(chromaAdapter, ollamaAdapter)
const strategyAgent = new StrategyAgent(chromaAdapter, ollamaAdapter)
const generator = new GeneratorAgent(ollamaAdapter)
const suggestionAgent = new SuggestionAgent()

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

    // Filtrar historial: eliminar mensajes de sistema (tablero/recursos) que no son
    // conversación real, y truncar a los últimos 4 para evitar contaminación de
    // respuestas genéricas previas al fix de /api/chat
    const SYSTEM_MSG_PATTERNS = [
      /^Tablero (configurado|actualizado|listo)/,
      /^Recursos confirmados:/,
      /^Cartas:/,
      /^Sin cartas de desarrollo/,
      /^Tablero recibido/,
    ]
    const cleanHistory = history
      .filter(m => !SYSTEM_MSG_PATTERNS.some(p => p.test(m.content)))
      .slice(-4)  // solo últimos 4 mensajes reales

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'Mensaje vacío' }), { status: 400 })
    }

    // 1. Route the question
    const route = router.classify(message)

    // 2. Retrieve context (RAG) + start suggestions in parallel
    const [context, suggestedQuestions] = await Promise.all([
      route === 'rules'
        ? rulesAgent.retrieve(message)
        : route === 'strategy'
          ? strategyAgent.retrieve(message)
          : Promise.resolve(''),
      suggestionAgent.suggest(message, cleanHistory, userLevel, activeCoachState),
    ])

    // 2.5 Short-circuit: if the question is about turns/production and we have coachState,
    // prepend the pre-computed answer into context so the LLM just has to paraphrase it
    let turnsContext = ''
    if (activeCoachState?.boardSummary && isTurnsQuestion(message)) {
      const estimate = computeTurnsEstimatePublic(
        activeCoachState.boardSummary,
        activeCoachState.resources ?? null
      )
      if (estimate) {
        turnsContext = `RESPUESTA PRE-CALCULADA (usa estos números exactos, no los modifiques ni pidas más información):\n${estimate}\n`
      }
    }

    // 2.6 Detect user claiming resources they don't have → inject correction
    const resourceCorrection = activeCoachState?.resources
      ? detectResourceContradiction(message, activeCoachState.resources)
      : null

    // 3. Stream the response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        try {
          let fullResponse = ''

          // Stream LLM tokens — buffer full response for post-processing
          // Build final context with any pre-computed corrections
          const finalContext = [resourceCorrection, turnsContext, context].filter(Boolean).join('\n')

          for await (const token of generator.generateStream(
            message,
            finalContext,
            cleanHistory,
            userLevel,
            seenConcepts,
            activeCoachState
          )) {
            fullResponse += token

            // Stream token to client only if it's not the RECOMMENDATION_JSON marker yet
            // (suppress the marker line from being shown in the chat bubble)
            const markerIdx = fullResponse.lastIndexOf('RECOMMENDATION_JSON:')
            if (markerIdx === -1) {
              // No marker yet — stream normally
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', token })}\n\n`))
            } else {
              // Marker appeared — only stream text before it
              const visibleSoFar = fullResponse.slice(0, markerIdx)
              const prevVisible  = fullResponse.slice(0, markerIdx - token.length)
              const newVisible   = visibleSoFar.slice(prevVisible.length)
              if (newVisible) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', token: newVisible })}\n\n`))
              }
            }
          }

          // Parse RECOMMENDATION_JSON from full response
          const { cleanText, recommendation } = extractRecommendation(stripNonLatinArtifacts(fullResponse))
          // If we were mid-suppression, make sure the clean final text was sent
          // (edge case: marker arrived in last token — already handled above)
          void cleanText  // used only for recommendation extraction; client built from tokens

          // Send suggestions, metadata, and optional board recommendation
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'done',
              suggestedQuestions,
              agentUsed: route,
              ...(recommendation ? { boardRecommendation: recommendation } : {}),
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
