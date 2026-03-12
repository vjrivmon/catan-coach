import { RouterAgent } from '../src/agents/RouterAgent'

const router = new RouterAgent()

describe('RouterAgent', () => {
  it('clasifica preguntas de reglas correctamente', () => {
    expect(router.classify('¿Cómo funciona el ladrón?')).toBe('rules')
    expect(router.classify('¿Cuántas cartas puedo tener?')).toBe('rules')
    expect(router.classify('¿Cuál es la regla del 7?')).toBe('rules')
    expect(router.classify('¿Qué recursos produce el bosque?')).toBe('rules')
    expect(router.classify('¿Cómo se construye una ciudad?')).toBe('rules')
  })

  it('clasifica preguntas de estrategia correctamente', () => {
    expect(router.classify('Dame consejos para mejorar mi juego')).toBe('strategy')
    expect(router.classify('¿Qué trucos usan los expertos para ganar más?')).toBe('strategy')
    expect(router.classify('Necesito una táctica óptima para negociar mejor')).toBe('strategy')
  })

  it('clasifica mensajes conversacionales como direct', () => {
    expect(router.classify('Hola')).toBe('direct')
    expect(router.classify('Vale')).toBe('direct')
    expect(router.classify('Gracias')).toBe('direct')
  })

  it('maneja mensajes vacíos y cortos', () => {
    const result = router.classify('ok')
    expect(['rules', 'strategy', 'direct']).toContain(result)
  })
})
