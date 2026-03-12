import { NextResponse } from 'next/server'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { OllamaAdapter } from '@/src/adapters/outbound/OllamaAdapter'
import { ChromaAdapter } from '@/src/adapters/outbound/ChromaAdapter'
import { config } from '@/src/config'

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
  ollama: OllamaAdapter
) {
  const files = readdirSync(folderPath).filter(f => f.endsWith('.txt'))
  const allChunks: string[] = []
  const allIds: string[] = []

  for (const file of files) {
    const text = readFileSync(join(folderPath, file), 'utf-8')
    const chunks = chunkText(text, chunkSize, overlap)
    chunks.forEach((chunk, i) => {
      allChunks.push(chunk)
      allIds.push(`${collectionName}_${file}_${i}`)
    })
  }

  const embeddings: number[][] = []
  for (const chunk of allChunks) {
    embeddings.push(await ollama.embed(chunk))
  }

  await chroma.add(collectionName, allChunks, embeddings, allIds)
  return allChunks.length
}

export async function POST() {
  try {
    const ollama = new OllamaAdapter()
    const chroma = new ChromaAdapter()
    const knowledgeBase = join(process.cwd(), 'knowledge')

    const [rulesCount, strategyCount] = await Promise.all([
      ingestFolder(
        join(knowledgeBase, 'rules'),
        config.chroma.rulesCollection,
        config.rag.rulesChunkSize,
        config.rag.rulesOverlap,
        chroma,
        ollama
      ),
      ingestFolder(
        join(knowledgeBase, 'strategy'),
        config.chroma.strategyCollection,
        config.rag.strategyChunkSize,
        config.rag.strategyOverlap,
        chroma,
        ollama
      ),
    ])

    return NextResponse.json({
      ok: true,
      rulesChunks: rulesCount,
      strategyChunks: strategyCount,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
