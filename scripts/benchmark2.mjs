/**
 * BENCHMARK 2 — Contextuales con GeneticAgent + Edge cases
 * Llama primero a /api/coach-recommend, luego a /api/chat con geneticRecommendation
 * node scripts/benchmark2.mjs
 * Resultados: /tmp/benchmark2-results.json
 */
import { writeFileSync } from 'fs'

const BASE = 'http://localhost:3000'

function containsAny(text, words) {
  const t = text.toLowerCase()
  return words.some(w => t.includes(w.toLowerCase()))
}
function containsAll(text, groups) {
  const t = text.toLowerCase()
  return groups.every(group => group.some(w => t.includes(w.toLowerCase())))
}
function containsNone(text, words) {
  const t = text.toLowerCase()
  return !words.some(w => t.includes(w.toLowerCase()))
}

/** Step 1: ask GeneticAgent */
async function askGenetic(resources, settlements, cities, roads, vp, roadLength, turn=8, numPlayers=4) {
  const res = await fetch(`${BASE}/api/coach-recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resources, settlements, cities, roads, vp, roadLength, gamePhasePlaying: true, turn, numPlayers }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  return res.json()
}

/** Step 2: ask LLM with board context + genetic recommendation */
async function askLLM(question, boardSummary, resources, geneticRec) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: question,
      history: [],
      userLevel: 'intermediate',
      seenConcepts: [],
      mode: 'coach',
      coachState: { boardSummary, resources, geneticRecommendation: geneticRec },
    }),
  })
  let full = '', agent = 'direct'
  const reader = res.body.getReader(); const dec = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read(); if (done) break
    for (const line of dec.decode(value, {stream:true}).split('\n')) {
      if (!line.startsWith('data: ')) continue
      try { const e = JSON.parse(line.slice(6)); if (e.type==='token') full+=e.token; if (e.type==='done') agent=e.agentUsed||'direct' } catch {}
    }
  }
  return { response: full, agentUsed: agent }
}

function evalResult(response, mustGroups, mustNot = []) {
  return { passed: containsAll(response, mustGroups) && containsNone(response, mustNot) }
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

const TESTS = [
  // ── C: Contextuales tablero ──────────────────────────────────────────────────
  {
    id: 'C1',
    desc: 'Rojo 2M+2A+0L → GeneticAgent dice camino, LLM debe recomendar camino',
    question: '¿Cuál es la mejor jugada que puedo hacer ahora?',
    board: {
      summary: 'TABLERO:\nTU COLOR (Rojo): 2 poblados (madera(9), cereal(6)), 3 caminos\nAzul: 2 poblados (arcilla(4)+madera(3), cereal(8)), 4 caminos\nVerde: 2 poblados (lana(11), mineral(10)+cereal(9)), 4 caminos\nNaranja: 2 poblados (arcilla(6), lana(5)+madera(4)), 3 caminos',
      resources: { wood:2, clay:2, wool:0, cereal:0, mineral:0 },
      settlements: [10,25], cities: [], roads: ['5_6','12_13','18_19'],
      vp: 2, roadLength: 3,
    },
    // Expected from GeneticAgent: build_road (has wood+clay but not wool+wheat for settlement)
    expectedGeneticAction: 'build_road',
    must: [['camino','road','construye']],
    mustNot: ['ciudad','city','poblado','settlement'],
  },
  {
    id: 'C2',
    desc: 'Rojo 1M+1A+1L+1T → puede poblado, GeneticAgent + LLM deben confirmarlo',
    question: '¿Puedo construir un poblado ahora?',
    board: {
      summary: 'TABLERO:\nTU COLOR (Azul): 2 poblados (mineral(8)+cereal(6), lana(9)+madera(11)), 4 caminos\nRojo: 2 poblados (arcilla(5)+madera(4), cereal(3)), 4 caminos',
      resources: { wood:1, clay:1, wool:1, cereal:1, mineral:0 },
      settlements: [15,32], cities: [], roads: ['7_8','14_15','20_21','28_29'],
      vp: 2, roadLength: 4,
    },
    expectedGeneticAction: 'build_settlement',
    must: [['sí','si ','puedes','puede','poblado','asentamiento']],
    mustNot: ['no puedes','no tienes','insuficiente','te falta'],
  },
  {
    id: 'C3',
    desc: 'Rojo 3Min+2Cer → ciudad posible, GeneticAgent + LLM deben recomendarla',
    question: '¿Tengo recursos para construir una ciudad?',
    board: {
      summary: 'TABLERO:\nTU COLOR (Verde): 2 poblados (mineral(8)+cereal(9), mineral(5)+cereal(6)), 4 caminos',
      resources: { wood:0, clay:0, wool:0, cereal:2, mineral:3 },
      settlements: [8,22], cities: [], roads: ['3_4','10_11','17_18','25_26'],
      vp: 2, roadLength: 4,
    },
    expectedGeneticAction: 'build_city',
    must: [['sí','si ','puedes','puede','ciudad']],
    mustNot: ['no puedes','no tienes','insuficiente','te falta'],
  },
  {
    id: 'C4',
    desc: 'Rojo 1M+1A — bloqueo adversario con 4 caminos hacia vértice clave',
    question: '¿Debería construir un camino ahora para bloquear al jugador Azul?',
    board: {
      summary: 'TABLERO:\nTU COLOR (Rojo): 2 poblados (cereal(6), madera(9)), 3 caminos\nAzul: 2 poblados (cereal(8), arcilla(4)), 4 caminos apuntando al vértice entre mineral(5) y cereal(9)',
      resources: { wood:1, clay:1, wool:0, cereal:0, mineral:0 },
      settlements: [5,18], cities: [], roads: ['2_3','9_10','15_16'],
      vp: 2, roadLength: 3,
    },
    expectedGeneticAction: 'build_road',
    must: [['camino','sí','si ','bloqueo','bloquear','expansión','expan']],
    mustNot: [],
  },
  {
    id: 'C5',
    desc: 'Rojo 4 maderas + puerto 2:1 madera — usar puerto para diversificar',
    question: 'Tengo 4 maderas y un puerto 2:1 de madera. ¿Qué me conviene hacer?',
    board: {
      summary: 'TABLERO:\nTU COLOR (Rojo): 2 poblados (madera(6), madera(4)), 4 caminos. Tiene puerto 2:1 de madera',
      resources: { wood:4, clay:0, wool:0, cereal:0, mineral:0 },
      settlements: [3,14], cities: [], roads: ['1_2','8_9','14_15','20_21'],
      vp: 2, roadLength: 4,
    },
    expectedGeneticAction: null, // any action involving trade/port
    must: [['puerto','2:1','intercambi','troca','cambia']],
    mustNot: [],
  },
  // ── T: Turno a turno ─────────────────────────────────────────────────────────
  {
    id: 'T1',
    desc: 'Producción dado 6 — Rojo en cereal(6) y madera(6)',
    question: 'Ha salido un 6. Tengo un poblado en cereal(6) y otro en madera(6). ¿Qué recursos recibo?',
    board: {
      summary: 'TU COLOR (Rojo): poblado en cereal(6), poblado en madera(6)',
      resources: { wood:0, clay:0, wool:0, cereal:0, mineral:0 },
      settlements: [10,25], cities: [], roads: [],
      vp: 2, roadLength: 0,
    },
    expectedGeneticAction: null,
    must: [['cereal','trigo','grano','espiga'], ['madera','leña','tronco']],
    mustNot: [],
  },
  {
    id: 'T2',
    desc: 'Descarte con 9 cartas — debe descartar 4',
    question: 'Ha salido un 7 y tengo 9 cartas en la mano. ¿Cuántas debo descartar?',
    board: {
      summary: 'TU COLOR (Rojo): 2 poblados, 9 cartas en mano',
      resources: { wood:2, clay:2, wool:2, cereal:2, mineral:1 },
      settlements: [10,25], cities: [], roads: [],
      vp: 2, roadLength: 0,
    },
    expectedGeneticAction: null,
    must: [['4']],
    mustNot: ['3','5','6'],
  },
  {
    id: 'T3',
    desc: 'Conteo de puntos — 2 poblados + 1 ciudad + camino largo = 6 PV, faltan 4',
    question: 'Tengo 2 poblados, 1 ciudad y la carta de camino más largo. ¿Cuántos puntos tengo y cuántos me faltan para ganar?',
    board: {
      summary: 'TU COLOR (Rojo): 2 poblados (2PV) + 1 ciudad (2PV) + camino largo (2PV) = 6PV',
      resources: { wood:0, clay:0, wool:0, cereal:0, mineral:0 },
      settlements: [10,25], cities: [30], roads: [],
      vp: 6, roadLength: 6,
    },
    expectedGeneticAction: null,
    must: [['6'], ['4','faltan','quedan','necesitas']],
    mustNot: [],
  },
  {
    id: 'T4',
    desc: 'Cuándo jugar Caballero — ladrón en hex propio',
    question: 'Tengo una carta Caballero y el ladrón está en mi hex de mineral(8). ¿Cuándo conviene jugarla?',
    board: {
      summary: 'TU COLOR (Rojo): ladrón en mineral(8) propio',
      resources: { wood:0, clay:0, wool:0, cereal:0, mineral:0 },
      settlements: [10], cities: [], roads: [],
      vp: 2, roadLength: 0,
    },
    expectedGeneticAction: null,
    must: [['antes','inicio','principio','turno'], ['ladrón','ladron','mover','quitar']],
    mustNot: [],
  },
  {
    id: 'T5',
    desc: 'Monopolio de trigo — cuando adversarios tienen muchos',
    question: 'Tengo Monopolio de trigo. Verde tiene 3 trigos y Azul tiene 3 trigos. ¿Es buen momento para usarlo?',
    board: {
      summary: 'TU COLOR (Rojo): carta Monopolio de trigo\nVerde: 3 trigos. Azul: 3 trigos',
      resources: { wood:1, clay:1, wool:1, cereal:0, mineral:0 },
      settlements: [10,25], cities: [], roads: [],
      vp: 2, roadLength: 0,
    },
    expectedGeneticAction: null,
    must: [['sí','si ','buen','momento','conveniente','recomend'], ['6','trigo','cereal','grano']],
    mustNot: [],
  },
  // ── E: Edge cases ─────────────────────────────────────────────────────────────
  {
    id: 'E1',
    desc: 'Puerto 2:1 madera — 4 maderas + puerto',
    question: '¿Puedo usar el puerto de madera 2:1 para conseguir otro recurso?',
    board: {
      summary: 'TU COLOR (Rojo): puerto 2:1 de madera, 4 maderas en mano',
      resources: { wood:4, clay:0, wool:0, cereal:0, mineral:0 },
      settlements: [10], cities: [], roads: [],
      vp: 2, roadLength: 0,
    },
    expectedGeneticAction: null,
    must: [['sí','si ','puedes','puede'], ['2','madera','leña','tronco']],
    mustNot: ['no puedes'],
  },
  {
    id: 'E2',
    desc: 'Ladrón en hex propio — no produce aunque salga el número',
    question: 'El ladrón está en mi hex de mineral con número 8. Si sale un 8, ¿produzco mineral?',
    board: {
      summary: 'TU COLOR (Rojo): ladrón situado en mineral(8)',
      resources: { wood:0, clay:0, wool:0, cereal:0, mineral:0 },
      settlements: [10], cities: [], roads: [],
      vp: 2, roadLength: 0,
    },
    expectedGeneticAction: null,
    must: [['no','bloquea','bloqueo']],
    mustNot: ['sí produces','sí recibes','produces normalmente'],
  },
  {
    id: 'E3',
    desc: 'Estrategia de descarte — qué descartar según cromosoma',
    question: 'Tengo 10 cartas: 3 maderas, 2 arcillas, 2 lanas, 2 trigos, 1 mineral. Sale un 7. ¿Cuáles 5 descarto?',
    board: {
      summary: 'TU COLOR (Rojo): 10 cartas en mano',
      resources: { wood:3, clay:2, wool:2, cereal:2, mineral:1 },
      settlements: [10,25], cities: [], roads: [],
      vp: 2, roadLength: 0,
    },
    expectedGeneticAction: null,
    must: [['5','descartar','descarta','quitar'], ['madera','leña','mineral','roca']],
    mustNot: [],
  },
  {
    id: 'E4',
    desc: 'A quién robar tras poner el ladrón',
    question: 'Acabo de mover el ladrón a un hex donde hay dos jugadores. ¿A quién le robo?',
    board: {
      summary: 'TU COLOR (Rojo): ladrón en hex con Azul (7PV) y Verde (4PV)',
      resources: { wood:0, clay:0, wool:0, cereal:0, mineral:0 },
      settlements: [10], cities: [], roads: [],
      vp: 2, roadLength: 0,
    },
    expectedGeneticAction: null,
    must: [['azul','más puntos','líder','ventaja','puntua']],
    mustNot: [],
  },
  {
    id: 'E5',
    desc: 'Exceso de un recurso sin puerto — 5 maderas, no produce nada más',
    question: 'Tengo 5 maderas y no produzco ningún recurso más. ¿Qué hago?',
    board: {
      summary: 'TU COLOR (Rojo): 2 poblados solo en madera(6) y madera(4), sin puerto',
      resources: { wood:5, clay:0, wool:0, cereal:0, mineral:0 },
      settlements: [10,25], cities: [], roads: [],
      vp: 2, roadLength: 0,
    },
    expectedGeneticAction: null,
    must: [['4:1','banco','intercambi','comercia']],
    mustNot: [],
  },
]

// ─── runner ──────────────────────────────────────────────────────────────────
async function main() {
  const results = []
  let passed = 0, failed = 0

  console.log('\n════════════════════════════════════════════════')
  console.log('  BENCHMARK 2 — Contextuales + Edge Cases')
  console.log('════════════════════════════════════════════════\n')

  for (const t of TESTS) {
    process.stdout.write(`[${t.id}] ${t.desc}...\n`)

    // Step 1: GeneticAgent
    let geneticRec = null
    let geneticOk = 'N/A'
    try {
      geneticRec = await askGenetic(
        t.board.resources, t.board.settlements, t.board.cities, t.board.roads,
        t.board.vp, t.board.roadLength
      )
      if (t.expectedGeneticAction) {
        geneticOk = geneticRec?.action === t.expectedGeneticAction ? '✅' : `❌ (got: ${geneticRec?.action})`
        console.log(`   GeneticAgent: ${geneticOk} → action=${geneticRec?.action} score=${geneticRec?.score?.toFixed(3)}`)
      } else {
        console.log(`   GeneticAgent: action=${geneticRec?.action} score=${geneticRec?.score?.toFixed(3)} (no expectation)`)
      }
    } catch(e) {
      console.log(`   GeneticAgent: 💥 ${e.message}`)
    }

    // Step 2: LLM
    try {
      const { response, agentUsed } = await askLLM(t.question, t.board.summary, t.board.resources, geneticRec)
      const { passed: ok } = evalResult(response, t.must, t.mustNot)
      console.log(`   LLM: ${ok ? '✅' : '❌'} agent:${agentUsed}`)
      if (!ok) {
        t.must.forEach((group, i) => {
          if (!containsAny(response, group)) console.log(`     ⚠ Grupo ${i} no encontrado: ${group.join('/')}`)
        })
        t.mustNot.forEach(w => {
          if (response.toLowerCase().includes(w.toLowerCase())) console.log(`     ⚠ No debería decir: "${w}"`)
        })
      }
      console.log(`   → "${response.slice(0,160).replace(/\n/g,' ')}..."\n`)

      const overallPassed = ok && (t.expectedGeneticAction == null || geneticRec?.action === t.expectedGeneticAction)
      results.push({ id: t.id, desc: t.desc, geneticAction: geneticRec?.action, expectedGeneticAction: t.expectedGeneticAction, geneticScore: geneticRec?.score, llmPassed: ok, passed: overallPassed, response: response.slice(0,400) })
      if (overallPassed) passed++; else failed++
    } catch(e) {
      console.log(`   LLM: 💥 ${e.message}\n`)
      results.push({ id: t.id, desc: t.desc, passed: false, error: e.message })
      failed++
    }
  }

  const total = passed + failed
  const score = Math.round(passed/total*100)
  console.log('════════════════════════════════════════════════')
  console.log(`  RESULTADO: ${passed}/${total} (${score}%)`)
  console.log('════════════════════════════════════════════════\n')
  writeFileSync('/tmp/benchmark2-results.json', JSON.stringify({ passed, failed, total, score, results }, null, 2))
  console.log('Resultados: /tmp/benchmark2-results.json')
}
main().catch(console.error)
