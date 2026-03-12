import type { Message, Session, UserLevel } from '../entities'

export interface LLMPort {
  generate(prompt: string, systemPrompt: string, stream?: boolean): Promise<string>
  generateStream(prompt: string, systemPrompt: string): AsyncIterable<string>
  embed(text: string): Promise<number[]>
}

export interface VectorStorePort {
  query(collection: string, embedding: number[], topK: number): Promise<string[]>
  add(collection: string, chunks: string[], embeddings: number[][], ids: string[]): Promise<void>
  collectionExists(collection: string): Promise<boolean>
  createCollection(collection: string): Promise<void>
}

export interface SessionPort {
  load(): Session | null
  save(session: Session): void
  clear(): void
}

export interface ChatRequest {
  message: string
  history: Message[]
  userLevel: UserLevel
  seenConcepts: string[]
}

export interface ChatResponse {
  answer: string
  suggestedQuestions: string[]
  agentUsed: 'rules' | 'strategy' | 'direct'
}
