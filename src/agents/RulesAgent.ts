import type { VectorStorePort, EmbeddingPort } from '../domain/ports'
import { config } from '../config'
import { RAGAgent } from './RAGAgent'

export class RulesAgent extends RAGAgent {
  constructor(vectorStore: VectorStorePort, embedder: EmbeddingPort) {
    super(vectorStore, embedder, config.chroma.rulesCollection, 'RulesAgent')
  }
}
