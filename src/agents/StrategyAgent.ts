import type { VectorStorePort, EmbeddingPort } from '../domain/ports'
import { config } from '../config'

export class StrategyAgent {
  constructor(
    private vectorStore: VectorStorePort,
    private embedder: EmbeddingPort
  ) {}

  async retrieve(query: string): Promise<string> {
    try {
      const embedding = await this.embedder.embed(query)
      const chunks = await this.vectorStore.query(
        config.chroma.strategyCollection,
        embedding,
        config.rag.topK
      )
      return chunks.join('\n\n---\n\n')
    } catch (err) {
      console.error('[StrategyAgent] retrieval error:', err)
      return ''
    }
  }
}
