/**
 * Test de respuestas por nivel de usuario
 * Prueba 3 preguntas típicas (principiante / intermedio / avanzado)
 * con el sistema actual y mide longitud + calidad de respuesta
 *
 * Uso: node scripts/test-level-response.mjs
 */

const BASE_URL = 'http://localhost:3000'

const BOARD_SUMMARY = `TU COLOR (Rojo):
  2 poblados: [Arcilla(6=5pts)+Bosque(6=5pts)→10pts/turno] y [Trigo(9=4pts)+Mineral(10=3pts)→7pts/turno]
  2 caminos: e12_15 y e10_12
  produce: arcilla+madera+trigo+mineral (~17pts/turno)
Azul:
  2 poblados: [Lana(5=4pts)] y [Trigo(8=5pts)]
  2 caminos`

const RESOURCES = { wood: 1, clay: 1, cereal: 0, wool: 0, mineral: 0 }

const COACH_STATE = {
  boardSummary: BOARD_SUMMARY,
  resources: RESOURCES,
}

// Preguntas para cada nivel
const TESTS = [
  // ── Principiante ──────────────────────────────────────────
  {
    level: 'beginner',
    label: 'PRINCIPIANTE',
    message: '¿Qué puedo construir ahora?',
    history: [],
  },
  {
    level: 'beginner',
    label: 'PRINCIPIANTE',
    message: '¿Qué son los pips?',
    history: [],
    noCoach: true,  // pregunta de reglas, sin tablero
  },
  // ── Intermedio ────────────────────────────────────────────
  {
    level: 'intermediate',
    label: 'INTERMEDIO',
    message: '¿Cuál es la mejor jugada para este turno?',
    history: [
      { role: 'user', content: '¿Qué puedo construir ahora?', timestamp: Date.now() - 10000 },
      { role: 'assistant', content: 'Puedes construir un camino.', timestamp: Date.now() - 9000 },
      { role: 'user', content: '¿Cuándo conviene comprar carta de desarrollo?', timestamp: Date.now() - 8000 },
      { role: 'assistant', content: 'Cuando tienes mineral, lana y trigo.', timestamp: Date.now() - 7000 },
    ],
  },
  {
    level: 'intermediate',
    label: 'INTERMEDIO',
    message: '¿Cuándo me conviene priorizar el camino más largo?',
    history: [],
    noCoach: true,
  },
  // ── Avanzado ──────────────────────────────────────────────
  {
    level: 'advanced',
    label: 'AVANZADO',
    message: '¿Qué recomiendas con este estado de tablero? Tengo 2 puntos, el azul va primero y controla la lana.',
    history: [
      { role: 'user', content: '¿Qué son los pips?', timestamp: Date.now() - 20000 },
      { role: 'user', content: 'probabilidad de sacar 6 vs 8', timestamp: Date.now() - 15000 },
      { role: 'user', content: 'estrategia de bloqueo con el ladrón', timestamp: Date.now() - 10000 },
    ],
  },
  {
    level: 'advanced',
    label: 'AVANZADO',
    message: '¿Cuál es el ratio óptimo de caminos/poblados para controlar el camino más largo sin sacrificar VP?',
    history: [],
    noCoach: true,
  },
]

async function streamResponse(body) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let agentUsed = ''
  let hasBoardRec = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const lines = decoder.decode(value, { stream: true }).split('\n')
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const ev = JSON.parse(line.slice(6))
        if (ev.type === 'token') fullText += ev.token
        if (ev.type === 'done') {
          agentUsed = ev.agentUsed || ''
          hasBoardRec = !!ev.boardRecommendation
        }
      } catch {}
    }
  }

  return { fullText, agentUsed, hasBoardRec }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  TEST DE RESPUESTAS POR NIVEL — Catan Coach')
  console.log('═══════════════════════════════════════════════════════════\n')

  for (const test of TESTS) {
    const body = {
      message: test.message,
      history: test.history || [],
      userLevel: test.level,
      seenConcepts: [],
      mode: test.noCoach ? 'aprende' : 'coach',
      ...(test.noCoach ? {} : { coachState: COACH_STATE }),
    }

    console.log(`── ${test.label} ────────────────────────────────────`)
    console.log(`❓ "${test.message}"`)
    console.log(`   Modo: ${test.noCoach ? 'aprende' : 'coach'} | Historial: ${test.history?.length ?? 0} msgs`)

    try {
      const start = Date.now()
      const { fullText, agentUsed, hasBoardRec } = await streamResponse(body)
      const elapsed = Date.now() - start

      const words = fullText.trim().split(/\s+/).length
      const sentences = fullText.split(/[.!?]+/).filter(s => s.trim()).length
      const hasRec = fullText.includes('RECOMMENDATION_JSON') || hasBoardRec

      console.log(`\n📝 RESPUESTA (${words} palabras, ${sentences} frases, ${elapsed}ms):`)
      console.log('─'.repeat(55))
      console.log(fullText.trim())
      console.log('─'.repeat(55))
      console.log(`   Agente: ${agentUsed} | BoardRec: ${hasRec ? '✅' : '❌'}`)
      console.log()
    } catch (err) {
      console.log(`   ❌ ERROR: ${err.message}\n`)
    }

    // Pausa entre llamadas
    await new Promise(r => setTimeout(r, 1500))
  }

  console.log('═══════════════════════════════════════════════════════════')
  console.log('  FIN DE TESTS')
  console.log('═══════════════════════════════════════════════════════════')
}

runTests()
