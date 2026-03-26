import type { LLMPort, EmbeddingPort } from '../../domain/ports'
import { config } from '../../config'

export class OllamaAdapter implements LLMPort, EmbeddingPort {
  constructor(private model: string = config.ollama.mainModel) {}

  async generate(prompt: string, systemPrompt: string): Promise<string> {
    const response = await fetch(`${config.ollama.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
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
    const response = await fetch(`${config.ollama.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
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
