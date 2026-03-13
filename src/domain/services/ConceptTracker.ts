import type { ConceptMap } from '../entities'
import { CATAN_CONCEPTS } from '../entities'

export class ConceptTracker {
  extract(text: string): string[] {
    const lower = text.toLowerCase()
    return CATAN_CONCEPTS.filter(concept => lower.includes(concept))
  }

  update(conceptMap: ConceptMap, newConcepts: string[]): ConceptMap {
    const updated = { ...conceptMap, topics: { ...conceptMap.topics } }
    const now = Date.now()

    for (const concept of newConcepts) {
      const existing = updated.topics[concept]
      updated.topics[concept] = {
        seen: true,
        timesDiscussed: (existing?.timesDiscussed ?? 0) + 1,
        lastSeen: now,
      }
    }

    updated.lastUpdated = now
    return updated
  }

  getSeenConcepts(conceptMap: ConceptMap): string[] {
    return Object.entries(conceptMap.topics)
      .filter(([, v]) => v.seen)
      .map(([k]) => k)
  }

  getProgressionMessage(conceptMap: ConceptMap, newConcepts: string[]): string | null {
    const seen = this.getSeenConcepts(conceptMap)
    if (newConcepts.length === 0) return null

    const total = CATAN_CONCEPTS.length
    const count = seen.length
    const listed = seen.slice(-3).join(', ')

    // Hitos más espaciados — la lista de conceptos siempre visible
    if (count === 5) {
      return `Llevamos un rato hablando y ya hemos repasado conceptos como: ${listed}. ¿Quieres profundizar en alguno o seguimos avanzando?`
    }
    if (count === 8) {
      return `Llevas ${count} de ${total} conceptos fundamentales cubiertos (${listed}). Vas bien encaminado.`
    }
    if (count === 12) {
      return `Con ${count} conceptos trabajados (entre ellos: ${listed}) ya tienes una base sólida. Ahora es cuestión de práctica y estrategia.`
    }

    return null
  }
}
