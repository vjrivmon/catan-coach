/**
 * Benchmark rápido — verifica que el LLM recibe contexto real del tablero
 * y que la recomendación del GeneticAgent llega correctamente.
 * node scripts/bench-quick.mjs
 */
const BASE = 'http://localhost:3000'

// Tablero de prueba: Rojo en cereal(6)+madera(9) y cereal(11)+mineral(5)
const BOARD_SUMMARY = `POSICIONES EN EL TABLERO:
TU COLOR (Rojo):
  2 poblados: [trigo(11=2pts)+madera(8=5pts)+mineral(3=2pts)→9pts/turno] y [trigo(6=5pts)+madera(9=4pts)→9pts/turno]
  4 caminos
  produce: trigo+madera+mineral (~18pts/turno)
Azul:
  2 poblados: [arcilla(5=4pts)+madera(4=3pts)→7pts/turno] y [trigo(9=4pts)+arcilla(6=5pts)→9pts/turno]
  4 caminos
  produce: arcilla+madera+trigo (~16pts/turno)`

const RESOURCES = { wood: 1, clay: 1, cereal: 1, wool: 0, mineral: 0 }

async function askGenetic() {
  const res = await fetch(`${BASE}/api/coach-recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resources: RESOURCES,
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

async function askLLM(question, geneticRec) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: question,
      history: [],
      userLevel: 'beginner',
      seenConcepts: [],
      mode: 'coach',
      coachState: {
        boardSummary: BOARD_SUMMARY,
        resources: RESOURCES,
        geneticRecommendation: geneticRec,
      },
    }),
  })
  let full = '', agent = 'direct'
  const reader = res.body.getReader(); const dec = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read(); if (done) break
    for (const line of dec.decode(value, { stream: true }).split('\n')) {
      if (!line.startsWith('data: ')) continue
      try { const e = JSON.parse(line.slice(6)); if (e.type==='token') full+=e.token; if (e.type==='done') agent=e.agentUsed||'direct' } catch {}
    }
  }
  return { response: full, agentUsed: agent }
}

function check(response, musts, mustNots = []) {
  const t = response.toLowerCase()
  const failedMust = musts.filter(m => !m.some(w => t.includes(w.toLowerCase())))
  const failedNot = mustNots.filter(w => t.includes(w.toLowerCase()))
  return { ok: failedMust.length === 0 && failedNot.length === 0, failedMust, failedNot }
}

async function main() {
  console.log('\n══════════════════════════════════════════════')
  console.log('  BENCH RÁPIDO — Contexto real al LLM')
  console.log('══════════════════════════════════════════════\n')

  // Step 1: GeneticAgent
  process.stdout.write('GeneticAgent (1M+1A+1C sin lana)... ')
  const genetic = await askGenetic()
  const geneticOk = genetic.action === 'build_road'
  console.log(`${geneticOk ? '✅' : '❌'} action=${genetic.action} score=${genetic.score?.toFixed(3)}`)
  console.log(`   reason: ${genetic.reason?.slice(0, 80)}\n`)

  const TESTS = [
    {
      id: 'Q1',
      desc: 'Con 1M+1A+1C: ¿cuál es la mejor jugada? — debe decir CAMINO (GeneticAgent dice build_road)',
      q: '¿Cuál es la mejor jugada que puedo hacer con mis recursos actuales y el estado del tablero?',
      must: [['camino','road'], ['madera','arcilla','ladrillo']],
      mustNot: ['sin conocer los detalles', 'no tengo información', 'no puedo dar una recomendación'],
    },
    {
      id: 'Q2',
      desc: '¿Puedo construir un poblado? NO (falta lana)',
      q: '¿Puedo construir un poblado ahora mismo?',
      must: [['no','falt','lana','pasto','oveja','insuficiente']],
      mustNot: ['sí puedes construir un poblado ahora'],
    },
    {
      id: 'Q3',
      desc: 'El LLM conoce los terrenos del tablero — debe mencionar producción real',
      q: '¿Qué recursos produzco más habitualmente?',
      must: [['trigo','madera','mineral','cereal'], ['turno','produc','hexágono','hex','número']],
      mustNot: ['sin conocer los detalles', 'no sé cuáles son tus poblados'],
    },
  ]

  let passed = 0
  for (const t of TESTS) {
    process.stdout.write(`[${t.id}] ${t.desc}...\n`)
    const { response, agentUsed } = await askLLM(t.q, genetic)
    const { ok, failedMust, failedNot } = check(response, t.must, t.mustNot)
    console.log(`   ${ok ? '✅' : '❌'} agent:${agentUsed}`)
    if (failedMust.length) console.log(`   ⚠ Faltan: ${failedMust.map(g => g[0]).join(', ')}`)
    if (failedNot.length) console.log(`   ⚠ No debería decir: ${failedNot.join(', ')}`)
    console.log(`   → "${response.slice(0, 200).replace(/\n/g, ' ')}...\n`)
    if (ok) passed++
  }

  const total = TESTS.length + (geneticOk ? 0 : 0)
  console.log('══════════════════════════════════════════════')
  console.log(`  RESULTADO: ${passed}/${TESTS.length} LLM + GeneticAgent:${geneticOk?'✅':'❌'}`)
  console.log('══════════════════════════════════════════════\n')

  if (!geneticOk) console.log('⚠ GeneticAgent no devuelve build_road — revisar integración')
  if (passed < TESTS.length) console.log('⚠ LLM no recibe contexto real — revisar buildBoardSummary y geneticRecommendation')
  else console.log('✅ LLM recibe contexto real y responde coherentemente')
}

main().catch(console.error)
