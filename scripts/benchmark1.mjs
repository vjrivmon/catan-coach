/**
 * BENCHMARK 1 — Costes básicos + Reglas + Sinónimos
 * node scripts/benchmark1.mjs
 * Resultados: /tmp/benchmark1-results.json
 */
import { writeFileSync } from 'fs'

const BASE = 'http://localhost:3000'

// ─── helpers ────────────────────────────────────────────────────────────────
function containsAny(text, words) {
  const t = text.toLowerCase()
  return words.some(w => t.includes(w.toLowerCase()))
}
function containsAll(text, groups) {
  // groups = array of arrays; each inner array is OR, outer is AND
  const t = text.toLowerCase()
  return groups.every(group => group.some(w => t.includes(w.toLowerCase())))
}
function containsNone(text, words) {
  const t = text.toLowerCase()
  return !words.some(w => t.includes(w.toLowerCase()))
}

async function ask(question, mode = 'aprende') {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: question, history: [], userLevel: 'beginner', seenConcepts: [], mode }),
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

function eval_(response, mustContainGroups, mustNotContain = []) {
  const allHit = containsAll(response, mustContainGroups)
  const noFalse = containsNone(response, mustNotContain)
  return { passed: allHit && noFalse }
}

// ─── preguntas ───────────────────────────────────────────────────────────────

// sinónimos completos por recurso
const MADERA  = ['madera','leña','tronco','tabla','árbol','arbol','bosque','lumber','wood']
const ARCILLA = ['arcilla','ladrillo','barro','adobe','brick','clay','cantera']
const LANA    = ['lana','pasto','oveja','hierba','fibra','vellón','vellon','sheep','wool']
const TRIGO   = ['trigo','cereal','grano','espiga','pan','harina','wheat','grain']
const MINERAL = ['mineral','roca','piedra','hierro','metal','ore','mena']

const TESTS = [
  // ── B: Costes básicos ──────────────────────────────────────────────────────
  {
    id: 'B1', desc: 'Coste poblado — 4 recursos correctos',
    q: '¿Cuánto cuesta construir un poblado?',
    must: [MADERA, ARCILLA, LANA, TRIGO],
    mustNot: []
  },
  {
    id: 'B2', desc: 'Coste ciudad — mineral + trigo, sin madera ni arcilla',
    q: '¿Cuánto cuesta construir una ciudad?',
    must: [MINERAL, TRIGO],
    mustNot: ['madera','leña','tronco','ladrillo','arcilla','barro'] // no contiene madera/arcilla en contexto de coste ciudad
  },
  {
    id: 'B3', desc: 'Coste camino — madera + arcilla',
    q: '¿Cuánto cuesta construir un camino?',
    must: [MADERA, ARCILLA],
    mustNot: ['lana','pasto','oveja','trigo','cereal','mineral','roca'] // no necesita estos
  },
  {
    id: 'B4', desc: 'Coste carta desarrollo — mineral + lana + trigo',
    q: '¿Cuánto cuesta comprar una carta de desarrollo?',
    must: [MINERAL, LANA, TRIGO],
    mustNot: ['madera','leña','arcilla','ladrillo']
  },
  {
    id: 'B5', desc: 'Puntos para ganar — 10',
    q: '¿Cuántos puntos de victoria necesito para ganar la partida?',
    must: [['10']],
    mustNot: []
  },
  // ── B6-B9: Reglas básicas ──────────────────────────────────────────────────
  {
    id: 'B6', desc: 'Regla del 7 — ladrón + descartar',
    q: '¿Qué pasa cuando sale un 7 en los dados?',
    must: [['ladrón','ladron','robber'], ['descartar','descarta','descartan']],
    mustNot: []
  },
  {
    id: 'B7a', desc: 'Producción bosque → madera',
    q: '¿Qué recurso produce un bosque en Catán?',
    must: [MADERA],
    mustNot: []
  },
  {
    id: 'B7b', desc: 'Producción montaña → mineral',
    q: '¿Qué recurso produce una montaña en Catán?',
    must: [MINERAL],
    mustNot: []
  },
  {
    id: 'B7c', desc: 'Producción campo → trigo',
    q: '¿Qué recurso produce un campo de trigo en Catán?',
    must: [TRIGO],
    mustNot: []
  },
  {
    id: 'B7d', desc: 'Producción prado → lana',
    q: '¿Qué recurso produce un prado en Catán?',
    must: [LANA],
    mustNot: []
  },
  {
    id: 'B7e', desc: 'Producción cantera → arcilla',
    q: '¿Qué recurso produce una cantera en Catán?',
    must: [ARCILLA],
    mustNot: []
  },
  {
    id: 'B8', desc: 'Regla de distancia — mínimo 2 aristas',
    q: '¿Qué es la regla de distancia en Catán?',
    must: [['2'], ['arista','intersección','interseccion','separación','separacion','distancia']],
    mustNot: []
  },
  {
    id: 'B9', desc: 'Ciudad requiere poblado existente',
    q: '¿Puedo construir una ciudad en cualquier lugar del tablero?',
    must: [['poblado','asentamiento'], ['mejorar','mejora','reemplazar','reemplaza','upgrade','existente']],
    mustNot: []
  },
  // ── S: Sinónimos ────────────────────────────────────────────────────────────
  {
    id: 'S1', desc: 'Poblado con sinónimos: trigo+pasto+leña+ladrillo → SÍ',
    q: 'Tengo 1 trigo, 1 pasto, 1 leña y 1 ladrillo. ¿Puedo construir un poblado?',
    must: [['sí','si ','puedes','puede','es posible']],
    mustNot: ['no puedes','no tienes','te falta','insuficiente']
  },
  {
    id: 'S2', desc: 'Poblado con sinónimos: cereal+oveja+madera+arcilla → SÍ',
    q: 'Tengo 1 cereal, 1 oveja, 1 madera y 1 arcilla. ¿Puedo construir un poblado?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no puedes','no tienes','te falta','insuficiente']
  },
  {
    id: 'S3', desc: 'Poblado con sinónimos: grano+fibra+tronco+barro → SÍ',
    q: 'Tengo 1 grano, 1 fibra, 1 tronco y 1 barro. ¿Puedo construir un poblado?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no puedes','no tienes','te falta','insuficiente']
  },
  {
    id: 'S4', desc: 'Poblado con sinónimos: espiga+hierba+árbol+adobe → SÍ',
    q: 'Tengo 1 espiga, 1 hierba, 1 árbol y 1 adobe. ¿Puedo construir un poblado?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no puedes','no tienes','te falta','insuficiente']
  },
  {
    id: 'S5', desc: 'Ciudad con sinónimos: 3 rocas + 2 granos → SÍ',
    q: 'Tengo 3 rocas y 2 granos. ¿Puedo construir una ciudad?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no puedes','no tienes','te falta','insuficiente']
  },
  {
    id: 'S6', desc: 'Ciudad con sinónimos: 3 piedras + 2 espigas → SÍ',
    q: 'Tengo 3 piedras y 2 espigas. ¿Puedo construir una ciudad?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no puedes','no tienes','te falta','insuficiente']
  },
  {
    id: 'S7', desc: 'Ciudad con sinónimos: 3 hierros + 2 cereales → SÍ',
    q: 'Tengo 3 hierros y 2 cereales. ¿Puedo construir una ciudad?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no puedes','no tienes','te falta','insuficiente']
  },
  {
    id: 'S8', desc: 'Camino con sinónimos: leña + barro → SÍ',
    q: 'Tengo 1 leña y 1 barro. ¿Puedo construir un camino?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no puedes','no tienes','te falta','insuficiente']
  },
  {
    id: 'S9', desc: 'Camino con sinónimos: tronco + adobe → SÍ',
    q: 'Tengo 1 tronco y 1 adobe. ¿Puedo construir un camino?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no puedes','no tienes','te falta','insuficiente']
  },
  {
    id: 'S10', desc: 'Camino con sinónimos: árbol + arcilla → SÍ',
    q: 'Tengo 1 árbol y 1 arcilla. ¿Puedo construir un camino?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no puedes','no tienes','te falta','insuficiente']
  },
  {
    id: 'S11', desc: 'Ciudad imposible: 2 rocas + 1 cereal → NO (falta mineral)',
    q: 'Tengo 2 rocas y 1 cereal. ¿Puedo construir una ciudad?',
    must: [['no ','no,','no.'], ['falt','mineral','roca','piedra']],
    mustNot: ['sí puedes','tienes suficiente','puedes construir']
  },
  {
    id: 'S12', desc: 'Poblado imposible: madera+arcilla+oveja sin trigo → NO',
    q: 'Tengo 1 madera, 1 arcilla y 1 oveja pero no tengo trigo. ¿Puedo construir un poblado?',
    must: [['no ','no,','no.'], ['trigo','cereal','grano','falt']],
    mustNot: ['sí puedes','tienes suficiente']
  },
  {
    id: 'S13', desc: 'Poblado imposible: leña+barro+hierba sin espiga → NO',
    q: 'Tengo 1 leña, 1 barro y 1 hierba pero me falta espiga. ¿Puedo construir un poblado?',
    must: [['no ','no,','no.'], ['trigo','cereal','grano','espiga','falt']],
    mustNot: ['sí puedes','tienes suficiente']
  },
  {
    id: 'S14', desc: 'Carta desarrollo: 1 roca + 1 grano + 1 oveja → SÍ',
    q: 'Tengo 1 roca, 1 grano y 1 oveja. ¿Puedo comprar una carta de desarrollo?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no puedes','no tienes','te falta','insuficiente']
  },
  {
    id: 'S15', desc: 'Carta desarrollo: 1 hierro + 1 cereal + 1 pasto → SÍ',
    q: 'Tengo 1 hierro, 1 cereal y 1 pasto. ¿Puedo comprar una carta de desarrollo?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no puedes','no tienes','te falta','insuficiente']
  },
]

// ─── runner ──────────────────────────────────────────────────────────────────
async function main() {
  const results = []
  let passed = 0, failed = 0

  console.log('\n════════════════════════════════════════════')
  console.log('  BENCHMARK 1 — Costes + Reglas + Sinónimos')
  console.log('════════════════════════════════════════════\n')

  for (const t of TESTS) {
    process.stdout.write(`[${t.id}] ${t.desc}... `)
    try {
      const { response, agentUsed } = await ask(t.q)
      const { passed: ok } = eval_(response, t.must, t.mustNot)
      console.log(`${ok ? '✅' : '❌'} agent:${agentUsed}`)
      if (!ok) {
        // show which groups failed
        t.must.forEach((group, i) => {
          if (!containsAny(response, group)) console.log(`   ⚠ Grupo ${i} no encontrado: ${group.join('/')}`)
        })
        t.mustNot.forEach(w => {
          if (response.toLowerCase().includes(w.toLowerCase())) console.log(`   ⚠ No debería decir: "${w}"`)
        })
      }
      console.log(`   → "${response.slice(0,160).replace(/\n/g,' ')}..."\n`)
      results.push({ ...t, response: response.slice(0,400), agentUsed, passed: ok, must: t.must.map(g=>g[0]), mustNot: t.mustNot })
      if (ok) passed++; else failed++
    } catch(e) {
      console.log(`💥 ERROR: ${e.message}\n`)
      results.push({ ...t, response: '', agentUsed: 'error', passed: false, error: e.message })
      failed++
    }
  }

  const total = passed + failed
  const score = Math.round(passed/total*100)
  console.log('════════════════════════════════════════════')
  console.log(`  RESULTADO: ${passed}/${total} (${score}%)`)
  console.log('════════════════════════════════════════════\n')
  writeFileSync('/tmp/benchmark1-results.json', JSON.stringify({ passed, failed, total, score, results }, null, 2))
  console.log('Resultados: /tmp/benchmark1-results.json')
}
main().catch(console.error)
