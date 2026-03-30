import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import type { EmbeddingPort } from '../src/domain/ports'
import { ChromaAdapter } from '../src/adapters/outbound/ChromaAdapter'
import { OllamaAdapter } from '../src/adapters/outbound/OllamaAdapter'
import { config } from '../src/config'

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const words = text.split(/\s+/)
  const chunks: string[] = []

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ')
    if (chunk.trim().length > 50) chunks.push(chunk.trim())
  }

  return chunks
}

async function ingestFolder(
  folderPath: string,
  collectionName: string,
  chunkSize: number,
  overlap: number,
  chroma: ChromaAdapter,
  embedder: EmbeddingPort
) {
  console.log(`\nIngesting ${folderPath} → ${collectionName}`)

  const files = readdirSync(folderPath).filter(f => f.endsWith('.txt'))
  const allChunks: string[] = []
  const allIds: string[] = []

  for (const file of files) {
    const text = readFileSync(join(folderPath, file), 'utf-8')
    const chunks = chunkText(text, chunkSize, overlap)
    console.log(`  ${file}: ${chunks.length} chunks`)

    for (let i = 0; i < chunks.length; i++) {
      allChunks.push(chunks[i])
      allIds.push(`${collectionName}_${file}_${i}`)
    }
  }

  console.log(`  Generating ${allChunks.length} embeddings...`)
  const embeddings: number[][] = []

  for (let i = 0; i < allChunks.length; i++) {
    if (i % 10 === 0) console.log(`  Progress: ${i}/${allChunks.length}`)
    const embedding = await embedder.embed(allChunks[i])
    embeddings.push(embedding)
  }

  // Delete and recreate collection for clean ingestion
  try {
    await chroma.deleteCollection(collectionName)
  } catch { /* doesn't exist yet */ }

  await chroma.add(collectionName, allChunks, embeddings, allIds)
  console.log(`  Done! ${allChunks.length} chunks indexed in ${collectionName}`)
}

async function main() {
  const chroma = new ChromaAdapter()
  const ollama = new OllamaAdapter()
  const knowledgeBase = join(process.cwd(), 'knowledge')

  console.log('Starting Catan Coach knowledge ingestion...')
  console.log(`Ollama: ${config.ollama.baseUrl} | Model: ${config.ollama.embeddingModel}`)
  console.log(`Chroma: ${config.chroma.url}`)

  await ingestFolder(
    join(knowledgeBase, 'rules'),
    config.chroma.rulesCollection,
    config.rag.rulesChunkSize,
    config.rag.rulesOverlap,
    chroma,
    ollama
  )

  await ingestFolder(
    join(knowledgeBase, 'strategy'),
    config.chroma.strategyCollection,
    config.rag.strategyChunkSize,
    config.rag.strategyOverlap,
    chroma,
    ollama
  )

  console.log('\nIngestion complete! Catan Coach is ready.')
}

main().catch(console.error)
