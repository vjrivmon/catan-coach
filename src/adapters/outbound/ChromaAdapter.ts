import type { VectorStorePort } from '../../domain/ports'
import { ChromaClient } from 'chromadb'
import { config } from '../../config'

/**
 * ChromaAdapter compatible with chromadb v3 (API v2).
 * v3 broke the constructor and query API vs v2:
 *   - Constructor: { host, port, ssl } still works but needs no EmbeddingFunction
 *   - getCollection / getOrCreateCollection: must pass embeddingFunction: null to skip default
 *   - query: uses queryEmbeddings (same), but collection methods changed slightly
 */
export class ChromaAdapter implements VectorStorePort {
  private client: ChromaClient

  constructor() {
    const url = new URL(config.chroma.url)
    this.client = new ChromaClient({
      host: url.hostname,
      port: parseInt(url.port || '8000', 10),
      ssl: url.protocol === 'https:',
    })
  }

  private async getCol(name: string) {
    // In chromadb v3, we must pass a no-op embedding function to avoid
    // "Cannot instantiate a collection with the DefaultEmbeddingFunction" error
    // when we supply our own embeddings
    const noopEF = {
      generate: async (texts: string[]) => texts.map(() => [] as number[]),
    }
    return this.client.getCollection({ name, embeddingFunction: noopEF as any })
  }

  private async getOrCreateCol(name: string) {
    const noopEF = {
      generate: async (texts: string[]) => texts.map(() => [] as number[]),
    }
    return this.client.getOrCreateCollection({ name, embeddingFunction: noopEF as any })
  }

  async query(collectionName: string, embedding: number[], topK: number): Promise<string[]> {
    const collection = await this.getCol(collectionName)
    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults: topK,
      include: ['documents'] as any,
    })
    return (results.documents?.[0] ?? []).filter(Boolean) as string[]
  }

  async add(
    collectionName: string,
    chunks: string[],
    embeddings: number[][],
    ids: string[]
  ): Promise<void> {
    const collection = await this.getOrCreateCol(collectionName)
    await collection.add({ ids, embeddings, documents: chunks })
  }

  async collectionExists(collectionName: string): Promise<boolean> {
    try {
      await this.getCol(collectionName)
      return true
    } catch {
      return false
    }
  }

  async createCollection(collectionName: string): Promise<void> {
    await this.getOrCreateCol(collectionName)
  }
}
