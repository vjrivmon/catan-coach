import type { VectorStorePort } from '../../domain/ports'
import { config } from '../../config'

/**
 * ChromaAdapter using direct HTTP calls to ChromaDB REST API.
 * No chromadb npm package needed — avoids @chroma-core/default-embed
 * Turbopack build issue with Next.js 16.
 */
export class ChromaAdapter implements VectorStorePort {
  private baseUrl: string

  constructor() {
    this.baseUrl = config.chroma.url.replace(/\/$/, '')
  }

  private async getCollectionId(name: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/v1/collections/${name}`)
    if (!res.ok) throw new Error(`ChromaDB: collection "${name}" not found (${res.status})`)
    const data = await res.json()
    return data.id
  }

  private async getOrCreateCollectionId(name: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/v1/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, get_or_create: true }),
    })
    if (!res.ok) throw new Error(`ChromaDB: failed to get/create collection "${name}" (${res.status})`)
    const data = await res.json()
    return data.id
  }

  async query(collectionName: string, embedding: number[], topK: number): Promise<string[]> {
    const id = await this.getCollectionId(collectionName)
    const res = await fetch(`${this.baseUrl}/api/v1/collections/${id}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query_embeddings: [embedding],
        n_results: topK,
        include: ['documents'],
      }),
    })
    if (!res.ok) throw new Error(`ChromaDB query error: ${res.status}`)
    const data = await res.json()
    return (data.documents?.[0] ?? []).filter(Boolean) as string[]
  }

  async add(
    collectionName: string,
    chunks: string[],
    embeddings: number[][],
    ids: string[]
  ): Promise<void> {
    const id = await this.getOrCreateCollectionId(collectionName)
    const res = await fetch(`${this.baseUrl}/api/v1/collections/${id}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, embeddings, documents: chunks }),
    })
    if (!res.ok) throw new Error(`ChromaDB add error: ${res.status}`)
  }

  async collectionExists(collectionName: string): Promise<boolean> {
    try {
      await this.getCollectionId(collectionName)
      return true
    } catch {
      return false
    }
  }

  async createCollection(collectionName: string): Promise<void> {
    await this.getOrCreateCollectionId(collectionName)
  }
}
