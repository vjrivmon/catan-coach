/**
 * Benchmark completo — 20 preguntas en 4 categorías
 * B1-B5: Básicas de reglas
 * S1-S5: Sinónimos de recursos
 * C1-C5: Contextuales con coachState real
 * T1-T5: Turno (dados, producción, cartas desarrollo)
 *
 * Uso: node scripts/benchmark-full.mjs
 */

const BASE = 'http://localhost:3000'

// ─── coachState para preguntas contextuales (C) ───────────────────────────────
const BOARD_SUMMARY = `POSICIONES EN EL TABLERO:
TU COLOR (Rojo):
  2 poblados: [trigo(11=2pts)+madera(8=5pts)→7pts/turno]
  produce: trigo+madera`

const RESOURCES = { wood: 1, clay: 1, cereal: 1, wool: 0, mineral: 0 }

const GENETIC_REC = {
  action: 'build_road',
  score: 1.045,
  reason: 'Building a road expands reach',
}

// ─── Grupos de sinónimos ──────────────────────────────────────────────────────
const SYNONYMS = {
  trigo:   ['trigo', 'cereal', 'grano', 'espiga'],
  mineral: ['mineral', 'roca', 'piedra', 'hierro', 'metal'],
  ladrillo:['ladrillo', 'arcilla', 'barro', 'adobe'],
  lana:    ['lana', 'pasto', 'oveja', 'hierba', 'fibra'],
  madera:  ['madera', 'leña', 'tronco', 'árbol', 'bosque'],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Llama al chat con streaming, devuelve {response, agentUsed} */
async function askLLM(question, coachState = null) {
  const body = {
    message: question,
    history: [],
    userLevel: 'beginner',
    seenConcepts: [],
    mode: 'coach',
  }
  if (coachState) body.coachState = coachState

  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  let full = '', agentUsed = 'direct'
  const reader = res.body.getReader()
  const dec = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of dec.decode(value, { stream: true }).split('\n')) {
      if (!line.startsWith('data: ')) continue
      try {
        const e = JSON.parse(line.slice(6))
        if (e.type === 'token') full += e.token
        if (e.type === 'done') agentUsed = e.agentUsed || 'direct'
      } catch {}
    }
  }
  return { response: full, agentUsed }
}

/** Llama a coach-recommend y devuelve el objeto JSON */
async function askGenetic(resources = RESOURCES) {
  const res = await fetch(`${BASE}/api/coach-recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resources,
      settlements: [30, 14],
      cities: [],
      roads: ['30_38', '38_42', '14_15', '15_25'],
      vp: 2,
      roadLength: 4,
      gamePhasePlaying: true,
      robberHex: 9,
    }),
  })
  return res.json()
}

/**
 * Evalúa la respuesta contra grupos de términos obligatorios.
 * musts: array de arrays — cada sub-array es un grupo OR (basta uno).
 * mustNots: array de strings que NO deben aparecer.
 * synonymGroups: dict de grupos de sinónimos — amplía la búsqueda automáticamente.
 */
function check(response, musts = [], mustNots = [], synonymGroups = {}) {
  const t = response.toLowerCase()

  // Expande cada término con sus sinónimos
  function expand(term) {
    const lower = term.toLowerCase()
    for (const group of Object.values(synonymGroups)) {
      if (group.some(s => s.toLowerCase() === lower)) return group
    }
    return [term]
  }

  const failedMust = musts.filter(group => {
    const expanded = group.flatMap(expand)
    return !expanded.some(w => t.includes(w.toLowerCase()))
  })

  const failedNot = mustNots.filter(w => t.includes(w.toLowerCase()))

  return {
    ok: failedMust.length === 0 && failedNot.length === 0,
    failedMust,
    failedNot,
  }
}

// ─── Definición de los 20 tests ───────────────────────────────────────────────

const TESTS = [
  // ── B: Básicas de reglas ────────────────────────────────────────────────────
  {
    id: 'B1',
    category: 'Básica',
    desc: 'Coste de construir un camino',
    q: '¿Qué recursos necesito para construir un camino en Catan?',
    must: [['madera', 'leña', 'tronco'], ['ladrillo', 'arcilla', 'barro']],
    mustNot: ['lana', 'trigo', 'mineral'],
  },
  {
    id: 'B2',
    category: 'Básica',
    desc: 'Coste de construir un poblado',
    q: '¿Cuántos y qué recursos hacen falta para un poblado?',
    must: [['madera', 'leña', 'tronco'], ['ladrillo', 'arcilla', 'barro'], ['lana', 'pasto', 'oveja'], ['trigo', 'cereal', 'grano']],
    mustNot: [],
  },
  {
    id: 'B3',
    category: 'Básica',
    desc: 'Coste de una ciudad',
    q: '¿Qué necesito para convertir un poblado en ciudad?',
    must: [['trigo', 'cereal', 'grano'], ['mineral', 'roca', 'piedra']],
    mustNot: [],
  },
  {
    id: 'B4',
    category: 'Básica',
    desc: 'Regla de distancia entre poblados',
    q: '¿Cuál es la regla de distancia entre poblados en Catan?',
    must: [['dos', '2', 'intersección', 'distancia', 'separación', 'camino']],
    mustNot: [],
  },
  {
    id: 'B5',
    category: 'Básica',
    desc: 'Función del ladrón',
    q: '¿Qué hace el ladrón en Catan?',
    must: [['ladrón', 'robber', 'bloqu', 'producción', 'robar', 'recurso']],
    mustNot: [],
  },

  // ── S: Sinónimos ────────────────────────────────────────────────────────────
  {
    id: 'S1',
    category: 'Sinónimos',
    desc: 'Coste de camino usando "tronco" y "ladrillo"',
    q: '¿Necesito tronco y ladrillo para construir un camino?',
    must: [['sí', 'correcto', 'exacto', 'afirm', 'así es', 'necesitas']],
    mustNot: [],
  },
  {
    id: 'S2',
    category: 'Sinónimos',
    desc: 'Coste de ciudad usando "roca"',
    q: '¿Para hacer una ciudad necesito roca y cereal?',
    must: [['sí', 'correcto', 'exacto', 'afirm', 'así es', 'necesitas']],
    mustNot: [],
  },
  {
    id: 'S3',
    category: 'Sinónimos',
    desc: 'Coste de poblado usando "pasto" y "leña"',
    q: '¿El poblado cuesta pasto, leña, arcilla y grano?',
    must: [['sí', 'correcto', 'exacto', 'afirm', 'así es', 'necesitas']],
    mustNot: [],
  },
  {
    id: 'S4',
    category: 'Sinónimos',
    desc: 'Reconoce "mineral" como recurso válido',
    q: '¿El mineral sirve para construir ciudades en Catan?',
    must: [['sí', 'correcto', 'exacto', 'afirm', 'así es', 'mineral', 'roca', 'piedra']],
    mustNot: [],
  },
  {
    id: 'S5',
    category: 'Sinónimos',
    desc: 'Reconoce "fibra" como sinónimo de lana',
    q: '¿La fibra es un recurso en Catan? ¿Para qué se usa?',
    must: [['lana', 'pasto', 'oveja', 'fibra', 'poblado', 'carta de desarrollo']],
    mustNot: [],
  },

  // ── C: Contextuales ─────────────────────────────────────────────────────────
  {
    id: 'C1',
    category: 'Contextual',
    desc: 'Mejor jugada con el coachState real → camino',
    q: '¿Cuál es la mejor jugada que puedo hacer ahora?',
    coachState: { boardSummary: BOARD_SUMMARY, resources: RESOURCES, geneticRecommendation: GENETIC_REC },
    must: [['camino', 'road', 'expandir', 'expansión', 'alcance', 'reach']],
    mustNot: ['no tengo información', 'sin conocer los detalles', 'no puedo dar una recomendación'],
    validateGeneticAction: 'build_road',
  },
  {
    id: 'C2',
    category: 'Contextual',
    desc: '¿Puedo construir un poblado? No (falta lana)',
    q: '¿Puedo construir un poblado ahora mismo?',
    coachState: { boardSummary: BOARD_SUMMARY, resources: RESOURCES, geneticRecommendation: GENETIC_REC },
    must: [['no', 'falt', 'lana', 'pasto', 'oveja', 'insuficiente']],
    mustNot: ['sí puedes construir un poblado ahora'],
  },
  {
    id: 'C3',
    category: 'Contextual',
    desc: '¿Qué recursos produzco? → trigo y madera',
    q: '¿Qué recursos produce mi tablero actualmente?',
    coachState: { boardSummary: BOARD_SUMMARY, resources: RESOURCES, geneticRecommendation: GENETIC_REC },
    must: [['trigo', 'cereal', 'grano'], ['madera', 'leña', 'tronco']],
    mustNot: ['no sé cuáles son tus poblados', 'sin conocer los detalles'],
  },
  {
    id: 'C4',
    category: 'Contextual',
    desc: '¿Cuántos puntos de victoria tengo? → 2 poblados = 2 PV',
    q: '¿Cuántos puntos de victoria tengo en este momento?',
    coachState: { boardSummary: BOARD_SUMMARY, resources: RESOURCES, geneticRecommendation: GENETIC_REC },
    must: [['2', 'dos']],
    mustNot: [],
  },
  {
    id: 'C5',
    category: 'Contextual',
    desc: 'Me faltan recursos para ciudad → faltan mineral y trigo',
    q: '¿Qué me falta para construir una ciudad?',
    coachState: { boardSummary: BOARD_SUMMARY, resources: RESOURCES, geneticRecommendation: GENETIC_REC },
    must: [['mineral', 'roca', 'piedra'], ['trigo', 'cereal', 'grano']],
    mustNot: [],
  },

  // ── T: Turno ─────────────────────────────────────────────────────────────────
  {
    id: 'T1',
    category: 'Turno',
    desc: 'Qué pasa al sacar un 7 con los dados',
    q: '¿Qué ocurre cuando se saca un 7 en los dados en Catan?',
    must: [['ladrón', 'robber', 'mover', 'descartar', 'robar']],
    mustNot: [],
  },
  {
    id: 'T2',
    category: 'Turno',
    desc: 'Orden de acciones en un turno',
    q: '¿En qué orden se realizan las acciones durante un turno en Catan?',
    must: [['dados', 'tirar', 'producción'], ['construir', 'comerciar', 'intercambiar']],
    mustNot: [],
  },
  {
    id: 'T3',
    category: 'Turno',
    desc: 'Qué producen los hexágonos con tu número',
    q: '¿Cuándo producen recursos los hexágonos?',
    must: [['dado', 'número', 'ficha', 'producción', 'coinc']],
    mustNot: [],
  },
  {
    id: 'T4',
    category: 'Turno',
    desc: 'Cómo se usa una carta de desarrollo',
    q: '¿Cómo y cuándo puedo jugar una carta de desarrollo?',
    must: [['turno', 'antes', 'después', 'dados', 'una vez', 'por turno']],
    mustNot: [],
  },
  {
    id: 'T5',
    category: 'Turno',
    desc: 'Diferencia entre caballero y monopolio',
    q: '¿Cuál es la diferencia entre una carta de Caballero y una de Monopolio?',
    must: [['caballero', 'knight', 'ladrón', 'robber'], ['monopolio', 'todos', 'recurso', 'toman']],
    mustNot: [],
  },
]

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runTest(test) {
  const { response, agentUsed } = await askLLM(test.q, test.coachState || null)

  // Validar acción del GeneticAgent si se requiere
  let geneticOk = null
  let geneticAction = null
  if (test.validateGeneticAction) {
    try {
      const genetic = await askGenetic(test.coachState?.resources || RESOURCES)
      geneticAction = genetic.action
      geneticOk = genetic.action === test.validateGeneticAction
    } catch (e) {
      geneticAction = 'ERROR'
      geneticOk = false
    }
  }

  const { ok, failedMust, failedNot } = check(response, test.must, test.mustNot, SYNONYMS)
  const passed = ok && (geneticOk === null || geneticOk === true)

  return {
    id: test.id,
    category: test.category,
    desc: test.desc,
    question: test.q,
    passed,
    llmOk: ok,
    geneticOk,
    geneticAction,
    agentUsed,
    response,
    responseTrunc: response.slice(0, 150).replace(/\n/g, ' '),
    failedMust,
    failedNot,
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║         BENCHMARK COMPLETO — Catan Coach — 20 preguntas      ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  const results = []
  const categoryScores = { Básica: 0, Sinónimos: 0, Contextual: 0, Turno: 0 }

  let currentCategory = ''

  for (const test of TESTS) {
    if (test.category !== currentCategory) {
      currentCategory = test.category
      console.log(`\n── ${currentCategory.toUpperCase()} ──────────────────────────────────`)
    }

    process.stdout.write(`[${test.id}] ${test.desc}... `)

    let result
    try {
      result = await runTest(test)
    } catch (err) {
      result = {
        id: test.id,
        category: test.category,
        desc: test.desc,
        question: test.q,
        passed: false,
        llmOk: false,
        geneticOk: null,
        agentUsed: 'error',
        response: '',
        responseTrunc: `ERROR: ${err.message}`,
        failedMust: [],
        failedNot: [],
        error: err.message,
      }
    }

    results.push(result)

    const icon = result.passed ? '✅' : '❌'
    console.log(`${icon} [${result.agentUsed}]`)

    if (result.geneticOk !== null) {
      console.log(`   🧬 GeneticAgent: action=${result.geneticAction} ${result.geneticOk ? '✅' : '❌'}`)
    }
    if (result.failedMust.length > 0) {
      console.log(`   ⚠ Faltan términos: ${result.failedMust.map(g => g[0]).join(', ')}`)
    }
    if (result.failedNot.length > 0) {
      console.log(`   ⚠ No debería decir: ${result.failedNot.join(', ')}`)
    }
    console.log(`   → "${result.responseTrunc}${result.response.length > 150 ? '…' : ''}"`)

    if (result.passed) categoryScores[result.category]++
  }

  // ─── Resumen final ───────────────────────────────────────────────────────────
  const total = results.filter(r => r.passed).length
  const pct = Math.round((total / TESTS.length) * 100)

  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log(`║  RESULTADO FINAL: ${total}/${TESTS.length} (${pct}%)${' '.repeat(39 - String(total).length - String(pct).length)}║`)
  console.log('╠══════════════════════════════════════════════════════════════╣')
  for (const [cat, score] of Object.entries(categoryScores)) {
    const bar = '█'.repeat(score) + '░'.repeat(5 - score)
    console.log(`║  ${cat.padEnd(12)} ${bar}  ${score}/5${' '.repeat(29 - cat.length)}║`)
  }
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  // ─── Guardar JSON ────────────────────────────────────────────────────────────
  const report = {
    timestamp: new Date().toISOString(),
    total,
    outOf: TESTS.length,
    pct,
    categoryScores,
    tests: results,
  }

  const fs = await import('fs')
  fs.writeFileSync('/tmp/benchmark-full-results.json', JSON.stringify(report, null, 2))
  console.log('📄 Resultados guardados en /tmp/benchmark-full-results.json\n')

  process.exit(total === TESTS.length ? 0 : 1)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(2)
})
