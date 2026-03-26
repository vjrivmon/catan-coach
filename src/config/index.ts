export const config = {
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    mainModel: process.env.MAIN_MODEL || 'gemma3:27b',
    coachModel: process.env.COACH_MODEL || process.env.SUGGESTION_MODEL || 'qwen3:8b',
    suggestionModel: process.env.SUGGESTION_MODEL || 'qwen3:8b',
    embeddingModel: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
  },
  chroma: {
    url: process.env.CHROMA_URL || 'http://localhost:8000',
    rulesCollection: 'catan_rules',
    strategyCollection: 'catan_strategy',
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    whisperModel: process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo',
  },
  rag: {
    topK: 5,
    rulesChunkSize: 400,
    rulesOverlap: 80,
    strategyChunkSize: 350,
    strategyOverlap: 70,
  },
}
