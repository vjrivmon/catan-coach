import type { LLMPort } from '../../domain/ports'
import { config } from '../../config'

export class OllamaAdapter implements LLMPort {
  async generate(prompt: string, systemPrompt: string): Promise<string> {
    // Use /api/chat with roles so the model treats systemPrompt as a real system instruction
    const response = await fetch(`${config.ollama.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollama.mainModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: prompt },
        ],
        stream: false,
      }),
    })
    if (!response.ok) throw new Error(`Ollama error: ${response.status}`)
    const data = await response.json()
    return data.message?.content || ''
  }

  async *generateStream(prompt: string, systemPrompt: string): AsyncIterable<string> {
    // Use /api/chat with roles — critical for models like llama3.3:70b that ignore
    // system instructions when they arrive as plain text via /api/generate
    const response = await fetch(`${config.ollama.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollama.mainModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: prompt },
        ],
        stream: true,
      }),
    })
    if (!response.ok || !response.body) throw new Error(`Ollama stream error: ${response.status}`)

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          // /api/chat stream: delta is in message.content
          if (parsed.message?.content) yield parsed.message.content
        } catch { /* ignore malformed lines */ }
      }
    }
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${config.ollama.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollama.embeddingModel,
        input: text,
      }),
    })
    if (!response.ok) throw new Error(`Ollama embed error: ${response.status}`)
    const data = await response.json()
    return data.embeddings?.[0] ?? data.embedding ?? []
  }
}
