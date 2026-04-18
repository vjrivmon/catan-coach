import type { VectorStorePort, EmbeddingPort } from '../domain/ports'
import { config } from '../config'

/**
 * Clase base para agentes RAG (retrieval-augmented generation). Reutilizada
 * por `RulesAgent` y `StrategyAgent` que sólo difieren en qué colección de
 * ChromaDB consultan. Evita duplicar el flujo embed → query → join.
 */
export class RAGAgent {
  constructor(
    protected vectorStore: VectorStorePort,
    protected embedder: EmbeddingPort,
    protected collectionName: string,
    protected label: string,
  ) {}

  async retrieve(query: string): Promise<string> {
    try {
      const embedding = await this.embedder.embed(query)
      const chunks = await this.vectorStore.query(
        this.collectionName,
        embedding,
        config.rag.topK,
      )
      return chunks.join('\n\n---\n\n')
    } catch (err) {
      console.error(`[${this.label}] retrieval error:`, err)
      return ''
    }
  }
}
