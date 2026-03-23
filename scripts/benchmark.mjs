/**
 * Catan Coach — Benchmark RAG + LLM
 * Ejecutar desde el Slimbook con: node scripts/benchmark.mjs
 * Guarda resultados en: /tmp/catan-benchmark-results.json
 */

import { writeFileSync } from 'fs'

const BASE = 'http://localhost:3000'

// ─── Preguntas benchmark ──────────────────────────────────────────────────────

const BEGINNER_QUESTIONS = [
  {
    id: 'B1',
    question: '¿Cuánto cuesta construir un poblado?',
    mustContain: ['madera', 'arcilla', 'lana', 'cereal', 'ladrillo', 'trigo'],
    mustNotContain: ['mineral', 'ore'],
    desc: 'Coste de poblado — debe listar los 4 recursos correctos'
  },
  {
    id: 'B2',
    question: '¿Cuánto cuesta construir una ciudad?',
    mustContain: ['mineral', 'cereal', 'trigo'],
    mustNotContain: ['madera', 'arcilla'],
    desc: 'Coste de ciudad — 3 mineral + 2 cereal, sin madera ni arcilla'
  },
  {
    id: 'B3',
    question: '¿Qué pasa cuando sale un 7 en los dados?',
    mustContain: ['ladrón', 'ladron', 'robar', 'descartar'],
    mustNotContain: [],
    desc: 'Regla del 7 — ladrón se activa'
  },
  {
    id: 'B4',
    question: '¿Cuántos puntos de victoria necesito para ganar?',
    mustContain: ['10'],
    mustNotContain: [],
    desc: 'Condición de victoria — 10 PV'
  },
  {
    id: 'B5',
    question: '¿Cuánto cuesta un camino?',
    mustContain: ['madera', 'arcilla', 'ladrillo'],
    mustNotContain: ['lana', 'cereal', 'mineral'],
    desc: 'Coste de camino — 1 madera + 1 arcilla'
  },
]

const COACH_QUESTIONS = [
  {
    id: 'C1',
    question: '¿Cuál es la mejor jugada que puedo hacer ahora?',
    coachState: {
      boardSummary: `TABLERO ACTUAL:
TU COLOR (Rojo): 2 poblados (madera(9), cereal(6)+mineral(5)), 3 caminos
Azul: 2 poblados (cereal(8), arcilla(4)+madera(3)), 4 caminos
Verde: 2 poblados (lana(11), mineral(10)+cereal(9)), 4 caminos
Naranja: 2 poblados (arcilla(6), lana(5)+madera(4)), 3 caminos

RECURSOS DE ROJO: madera×2, arcilla×2, lana×1, cereal×0, mineral×0`,
      resources: { wood: 2, clay: 2, wool: 1, cereal: 0, mineral: 0 }
    },
    mustContain: ['camino', 'madera', 'arcilla'],
    mustNotContain: ['ciudad'],
    desc: 'Con 2M+2A+1L: puede camino (✓) pero NO ciudad ni poblado — debe recomendar camino'
  },
  {
    id: 'C2',
    question: '¿Puedo construir un poblado ahora?',
    coachState: {
      boardSummary: `TABLERO ACTUAL:
TU COLOR (Azul): 2 poblados (mineral(8)+cereal(6), lana(9)+madera(11)), 4 caminos
Rojo: 2 poblados (arcilla(5)+madera(4), cereal(3)), 4 caminos

RECURSOS DE AZUL: madera×1, arcilla×1, lana×1, cereal×1, mineral×0`,
      resources: { wood: 1, clay: 1, wool: 1, cereal: 1, mineral: 0 }
    },
    mustContain: ['sí', 'si', 'puedes', 'puede', 'poblado'],
    mustNotContain: ['no puedes', 'no tienes', 'insuficiente'],
    desc: 'Con 1M+1A+1L+1C: tiene exactamente los recursos para un poblado'
  },
  {
    id: 'C3',
    question: '¿Tengo recursos para construir una ciudad?',
    coachState: {
      boardSummary: `TABLERO ACTUAL:
TU COLOR (Verde): 2 poblados (mineral(8)+cereal(9), mineral(5)+cereal(6)), 4 caminos

RECURSOS DE VERDE: madera×0, arcilla×0, lana×0, cereal×2, mineral×2`,
      resources: { wood: 0, clay: 0, wool: 0, cereal: 2, mineral: 2 }
    },
    mustContain: ['no', 'falta', 'mineral', 'cereal'],
    mustNotContain: ['sí puedes', 'tienes suficiente'],
    desc: 'Con 2C+2M: ciudad cuesta 3 mineral + 2 cereal — falta 1 mineral'
  },
]

// ─── Runner ───────────────────────────────────────────────────────────────────

async function askQuestion(question, mode, coachState) {
  const body = {
    message: question,
    history: [],
    userLevel: 'beginner',
    seenConcepts: [],
    mode,
    ...(coachState ? { coachState } : {}),
  }

  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  let fullResponse = ''
  let agentUsed = 'unknown'

  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const lines = decoder.decode(value, { stream: true }).split('\n')
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const ev = JSON.parse(line.slice(6))
        if (ev.type === 'token') fullResponse += ev.token
        if (ev.type === 'done') agentUsed = ev.agentUsed ?? 'direct'
      } catch { /* skip */ }
    }
  }

  return { response: fullResponse, agentUsed }
}

function evaluate(result, mustContain, mustNotContain) {
  const lower = result.toLowerCase()
  const hits   = mustContain.filter(w => lower.includes(w))
  const misses = mustContain.filter(w => !lower.includes(w))
  const badHits = mustNotContain.filter(w => lower.includes(w))
  const passed = misses.length === 0 && badHits.length === 0
  return { passed, hits, misses, badHits }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const results = []
  let passed = 0
  let failed = 0

  console.log('\n═══════════════════════════════════════')
  console.log('  CATAN COACH — BENCHMARK')
  console.log('═══════════════════════════════════════\n')

  // — Beginner questions —
  console.log('── MODO APRENDIZAJE (RAG rules + strategy) ──\n')
  for (const q of BEGINNER_QUESTIONS) {
    process.stdout.write(`[${q.id}] ${q.desc}... `)
    try {
      const { response, agentUsed } = await askQuestion(q.question, 'aprende', null)
      const eval_ = evaluate(response, q.mustContain, q.mustNotContain)
      const icon = eval_.passed ? '✅' : '❌'
      console.log(`${icon} agent:${agentUsed}`)
      if (!eval_.passed) {
        if (eval_.misses.length > 0) console.log(`   ⚠ Faltan: ${eval_.misses.join(', ')}`)
        if (eval_.badHits.length > 0) console.log(`   ⚠ No debería decir: ${eval_.badHits.join(', ')}`)
      }
      console.log(`   → "${response.slice(0, 140).replace(/\n/g, ' ')}..."`)
      results.push({ ...q, response: response.slice(0, 500), agentUsed, ...eval_ })
      if (eval_.passed) passed++; else failed++
    } catch(e) {
      console.log(`💥 ERROR: ${e.message}`)
      results.push({ ...q, response: '', agentUsed: 'error', passed: false, error: e.message })
      failed++
    }
    console.log()
  }

  // — Coach mode questions —
  console.log('\n── MODO COACH EN PARTIDA (coachState real) ──\n')
  for (const q of COACH_QUESTIONS) {
    process.stdout.write(`[${q.id}] ${q.desc}... `)
    try {
      const { response, agentUsed } = await askQuestion(q.question, 'coach', q.coachState)
      const eval_ = evaluate(response, q.mustContain, q.mustNotContain)
      const icon = eval_.passed ? '✅' : '❌'
      console.log(`${icon} agent:${agentUsed}`)
      if (!eval_.passed) {
        if (eval_.misses.length > 0) console.log(`   ⚠ Faltan: ${eval_.misses.join(', ')}`)
        if (eval_.badHits.length > 0) console.log(`   ⚠ No debería decir: ${eval_.badHits.join(', ')}`)
      }
      console.log(`   → "${response.slice(0, 140).replace(/\n/g, ' ')}..."`)
      results.push({ ...q, response: response.slice(0, 500), agentUsed, ...eval_ })
      if (eval_.passed) passed++; else failed++
    } catch(e) {
      console.log(`💥 ERROR: ${e.message}`)
      results.push({ ...q, response: '', agentUsed: 'error', passed: false, error: e.message })
      failed++
    }
    console.log()
  }

  const total = passed + failed
  const score = Math.round((passed / total) * 100)
  console.log('═══════════════════════════════════════')
  console.log(`  RESULTADO: ${passed}/${total} (${score}%)`)
  console.log('═══════════════════════════════════════\n')

  writeFileSync('/tmp/catan-benchmark-results.json', JSON.stringify({ passed, failed, total, score, results }, null, 2))
  console.log('Resultados guardados en /tmp/catan-benchmark-results.json')
}

main().catch(console.error)
