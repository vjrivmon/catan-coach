import { ConceptTracker } from '../src/domain/services/ConceptTracker'
import type { ConceptMap } from '../src/domain/entities'

const tracker = new ConceptTracker()

const emptyMap: ConceptMap = { topics: {}, lastUpdated: Date.now() }

describe('ConceptTracker', () => {
  it('extrae conceptos del texto correctamente', () => {
    const concepts = tracker.extract('El ladrón se activa cuando sale un 7. Puedes robar recursos.')
    expect(concepts).toContain('ladrón')
  })

  it('extrae múltiples conceptos', () => {
    const text = 'Los recursos son clave. El comercio con los puertos te da ventaja. Los dados determinan qué se produce.'
    const concepts = tracker.extract(text)
    expect(concepts.length).toBeGreaterThan(1)
    expect(concepts).toContain('recursos')
    expect(concepts).toContain('puertos')
    expect(concepts).toContain('dados')
  })

  it('no extrae conceptos que no aparecen', () => {
    const concepts = tracker.extract('Hola, ¿cómo estás?')
    expect(concepts).toHaveLength(0)
  })

  it('actualiza el mapa de conceptos correctamente', () => {
    const updated = tracker.update(emptyMap, ['ladrón', 'recursos'])
    expect(updated.topics['ladrón'].seen).toBe(true)
    expect(updated.topics['recursos'].timesDiscussed).toBe(1)
  })

  it('incrementa timesDiscussed en conceptos ya vistos', () => {
    const first = tracker.update(emptyMap, ['caminos'])
    const second = tracker.update(first, ['caminos'])
    expect(second.topics['caminos'].timesDiscussed).toBe(2)
  })

  it('getSeenConcepts devuelve solo los vistos', () => {
    const map = tracker.update(emptyMap, ['ladrón', 'puertos'])
    const seen = tracker.getSeenConcepts(map)
    expect(seen).toContain('ladrón')
    expect(seen).toContain('puertos')
    expect(seen).not.toContain('ciudades')
  })
})
