import { LevelDetector } from '../src/domain/services/LevelDetector'
import type { Message } from '../src/domain/entities'

const detector = new LevelDetector()

function makeMessages(contents: string[]): Message[] {
  return contents.map((content, i) => ({
    id: `${i}`,
    role: 'user' as const,
    content,
    timestamp: Date.now(),
  }))
}

describe('LevelDetector', () => {
  it('devuelve beginner con historial vacío', () => {
    expect(detector.detect([])).toBe('beginner')
  })

  it('devuelve beginner con preguntas básicas', () => {
    const msgs = makeMessages([
      '¿Cómo se juega?',
      '¿Qué son los recursos?',
      '¿Cómo gano puntos?',
    ])
    expect(detector.detect(msgs)).toBe('beginner')
  })

  it('devuelve intermediate con palabras clave de estrategia', () => {
    const msgs = makeMessages([
      '¿Cuál es la mejor estrategia de colocación inicial?',
      '¿Cuándo usar el caballero?',
      '¿Cómo funciona el intercambio marítimo?',
    ])
    expect(detector.detect(msgs)).toBe('intermediate')
  })

  it('devuelve advanced con keywords avanzadas', () => {
    const msgs = makeMessages([
      '¿Cómo calcular los pips óptimos?',
      '¿Cuál es el mejor bloqueo para cortar el camino más largo?',
      '¿Qué estrategia de monopolio tiene mejor tempo?',
    ])
    expect(detector.detect(msgs)).toBe('advanced')
  })

  it('getLevelLabel devuelve texto en español', () => {
    expect(detector.getLevelLabel('beginner')).toBe('principiante')
    expect(detector.getLevelLabel('intermediate')).toBe('intermedio')
    expect(detector.getLevelLabel('advanced')).toBe('avanzado')
  })
})
