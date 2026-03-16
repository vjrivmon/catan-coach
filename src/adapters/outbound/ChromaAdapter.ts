import type { VectorStorePort } from '../../domain/ports'
import { ChromaClient } from 'chromadb'
import { config } from '../../config'

export class ChromaAdapter implements VectorStorePort {
  private client: ChromaClient

  constructor() {
    const url = new URL(config.chroma.url)
    this.client = new ChromaClient({
      host: url.hostname,
      port: parseInt(url.port, 10),
      ssl: url.protocol === 'https:',
    })
  }

  async query(collectionName: string, embedding: number[], topK: number): Promise<string[]> {
    const collection = await this.client.getCollection({ name: collectionName })
    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults: topK,
    })
    return (results.documents?.[0] ?? []).filter(Boolean) as string[]
  }

  async add(
    collectionName: string,
    chunks: string[],
    embeddings: number[][],
    ids: string[]
  ): Promise<void> {
    const collection = await this.client.getOrCreateCollection({ name: collectionName })
    await collection.add({ ids, embeddings, documents: chunks })
  }

  async collectionExists(collectionName: string): Promise<boolean> {
    try {
      await this.client.getCollection({ name: collectionName })
      return true
    } catch {
      return false
    }
  }

  async createCollection(collectionName: string): Promise<void> {
    await this.client.createCollection({ name: collectionName })
  }
}
