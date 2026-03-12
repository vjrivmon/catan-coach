import type { LLMPort } from '../domain/ports'
import type { Message, UserLevel } from '../domain/entities'
import { config } from '../config'

function buildSystemPrompt(level: UserLevel, seenConcepts: string[]): string {
  const levelLabel = level === 'beginner' ? 'principiante' : level === 'intermediate' ? 'intermedio' : 'avanzado'
  const conceptsText = seenConcepts.length > 0
    ? `Conceptos ya vistos en esta sesión: ${seenConcepts.join(', ')}.`
    : 'Es la primera sesión del usuario.'

  return `Eres Catan Coach, un asistente experto en el juego de mesa Catan (juego base, en español).
Tu misión es ayudar a los jugadores a aprender y mejorar de forma progresiva.

Nivel del usuario: ${levelLabel}. ${conceptsText}

Instrucciones:
- Adapta la profundidad de tu respuesta al nivel detectado.
- Para principiantes: explica conceptos básicos con ejemplos claros.
- Para intermedios: asume conocimiento básico, profundiza en estrategia.
- Para avanzados: habla de optimización, probabilidades y meta-juego.
- Si hay contexto RAG disponible, úsalo como base de tu respuesta.
- Sé conciso pero completo. Responde siempre en español.
- Si la pregunta no tiene que ver con Catan, redirige amablemente.
- No menciones el nivel del usuario explícitamente a menos que sea relevante.`
}

function buildUserPrompt(message: string, context: string, history: Message[]): string {
  const historyText = history.slice(-6).map(m =>
    `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`
  ).join('\n')

  let prompt = ''
  if (historyText) prompt += `Historial reciente:\n${historyText}\n\n`
  if (context) prompt += `Contexto relevante del reglamento/estrategia:\n${context}\n\n`
  prompt += `Pregunta actual: ${message}`

  return prompt
}

export class GeneratorAgent {
  constructor(private llm: LLMPort) {}

  async *generateStream(
    message: string,
    context: string,
    history: Message[],
    level: UserLevel,
    seenConcepts: string[]
  ): AsyncIterable<string> {
    const systemPrompt = buildSystemPrompt(level, seenConcepts)
    const userPrompt = buildUserPrompt(message, context, history)

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
