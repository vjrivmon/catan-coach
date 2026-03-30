import type { VectorStorePort } from '../../domain/ports'
import { config } from '../../config'

/**
 * ChromaAdapter using direct HTTP calls to ChromaDB REST API v2.
 * No chromadb npm package needed — avoids @chroma-core/default-embed
 * Turbopack build issue with Next.js 16.
 * API base: /api/v2/tenants/{tenant}/databases/{database}/collections
 */
export class ChromaAdapter implements VectorStorePort {
  private baseUrl: string
  private collBase: string

  constructor() {
    this.baseUrl = config.chroma.url.replace(/\/$/, '')
    this.collBase = `${this.baseUrl}/api/v2/tenants/default_tenant/databases/default_database/collections`
  }

  private async getCollectionId(name: string): Promise<string> {
    const res = await fetch(`${this.collBase}/${name}`)
    if (!res.ok) throw new Error(`ChromaDB: collection "${name}" not found (${res.status})`)
    const data = await res.json()
    return data.id
  }

  private async getOrCreateCollectionId(name: string): Promise<string> {
    // Try get first
    const getRes = await fetch(`${this.collBase}/${name}`)
    if (getRes.ok) {
      const data = await getRes.json()
      return data.id
    }
    // Create
    const createRes = await fetch(this.collBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!createRes.ok) throw new Error(`ChromaDB: failed to create collection "${name}" (${createRes.status})`)
    const data = await createRes.json()
    return data.id
  }

  async query(collectionName: string, embedding: number[], topK: number): Promise<string[]> {
    const id = await this.getCollectionId(collectionName)
    const res = await fetch(`${this.collBase}/${id}/query`, {
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
    const res = await fetch(`${this.collBase}/${id}/add`, {
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

  async deleteCollection(collectionName: string): Promise<void> {
    const res = await fetch(`${this.collBase}/${collectionName}`, {
      method: 'DELETE',
    })
    if (!res.ok && res.status !== 404) throw new Error(`ChromaDB delete error: ${res.status}`)
  }
}
