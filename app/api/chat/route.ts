import { NextRequest } from 'next/server'
import { RouterAgent } from '@/src/agents/RouterAgent'
import { RulesAgent } from '@/src/agents/RulesAgent'
import { StrategyAgent } from '@/src/agents/StrategyAgent'
import { GeneratorAgent } from '@/src/agents/GeneratorAgent'
import { SuggestionAgent, type CoachState } from '@/src/agents/SuggestionAgent'
import { OllamaAdapter } from '@/src/adapters/outbound/OllamaAdapter'
import { ChromaAdapter } from '@/src/adapters/outbound/ChromaAdapter'
import type { Message, UserLevel } from '@/src/domain/entities'

const router = new RouterAgent()
const ollamaAdapter = new OllamaAdapter()
const chromaAdapter = new ChromaAdapter()
const rulesAgent = new RulesAgent(chromaAdapter, ollamaAdapter)
const strategyAgent = new StrategyAgent(chromaAdapter, ollamaAdapter)
const generator = new GeneratorAgent(ollamaAdapter)
const suggestionAgent = new SuggestionAgent()

export async function POST(req: NextRequest) {
  try {
    const { message, history, userLevel, seenConcepts, coachState } = await req.json() as {
      message: string
      history: Message[]
      userLevel: UserLevel
      seenConcepts: string[]
      coachState?: CoachState
    }

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
      suggestionAgent.suggest(message, history, userLevel, coachState),
    ])

    // 3. Stream the response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        try {
          // Stream LLM tokens
          for await (const token of generator.generateStream(
            message,
            context,
            history,
            userLevel,
            seenConcepts
          )) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', token })}\n\n`))
          }

          // Send suggestions and metadata at the end
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'done',
              suggestedQuestions,
              agentUsed: route,
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
