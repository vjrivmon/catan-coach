/**
 * Re-test de los tests que fallaron en BM1
 * Solo prueba: B8, S5, S6, S7, S9, S10, S11, S14, S15
 * node scripts/retest-failed.mjs
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

async function ask(question) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: question, history: [], userLevel: 'beginner', seenConcepts: [], mode: 'aprende' }),
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

const MINERAL = ['mineral','roca','piedra','hierro','metal','ore','mena']
const MADERA  = ['madera','leña','tronco','tabla','árbol','arbol','bosque']
const ARCILLA = ['arcilla','ladrillo','barro','adobe','brick','clay']
const TRIGO   = ['trigo','cereal','grano','espiga','pan','grain','wheat']
const LANA    = ['lana','pasto','oveja','hierba','fibra','sheep','wool']

const TESTS = [
  {
    id: 'B8', desc: 'Regla de distancia — menciona separación mínima entre poblados',
    q: '¿Qué es la regla de distancia en Catán?',
    must: [['2'], ['interseccion','intersección','separacion','separación','adyacente','distancia','arista','vértice','vertice','entre']],
    mustNot: []
  },
  {
    id: 'S5', desc: 'Ciudad con "3 rocas + 2 granos" → SÍ',
    q: 'Tengo 3 rocas y 2 granos. ¿Puedo construir una ciudad?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no tienes los recursos necesarios','te faltan recursos','no es posible construir']
  },
  {
    id: 'S6', desc: 'Ciudad con "3 piedras + 2 espigas" → SÍ',
    q: 'Tengo 3 piedras y 2 espigas. ¿Puedo construir una ciudad?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no tienes los recursos necesarios','te faltan recursos','no es posible construir']
  },
  {
    id: 'S7', desc: 'Ciudad con "3 hierros + 2 cereales" → SÍ',
    q: 'Tengo 3 hierros y 2 cereales. ¿Puedo construir una ciudad?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no puedes','no tienes','te falta','insuficiente']
  },
  {
    id: 'S9', desc: 'Camino con "tronco + adobe" → SÍ',
    q: 'Tengo 1 tronco y 1 adobe. ¿Puedo construir un camino?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no puedes','no tienes','te falta','insuficiente']
  },
  {
    id: 'S10', desc: 'Camino con "árbol + arcilla" → SÍ',
    q: 'Tengo 1 árbol y 1 arcilla. ¿Puedo construir un camino?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no puedes','no tienes','te falta','insuficiente']
  },
  {
    id: 'S11', desc: 'Ciudad imposible: 2 rocas + 1 cereal → NO (falta mineral o cereal)',
    q: 'Tengo 2 rocas y 1 cereal. ¿Puedo construir una ciudad?',
    must: [['no ','no,','no.','necesitas 3','te falta','faltan','insuficiente','solo tienes 2']],
    mustNot: ['sí puedes construir una ciudad ahora','tienes exactamente los recursos']
  },
  {
    id: 'S14', desc: 'Carta dev: 1 roca + 1 grano + 1 oveja → SÍ (tiene los 3 recursos)',
    q: 'Tengo 1 roca, 1 grano y 1 oveja. ¿Puedo comprar una carta de desarrollo?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no tienes los recursos necesarios','te faltan recursos para comprar']
  },
  {
    id: 'S15', desc: 'Carta dev: 1 hierro + 1 cereal + 1 pasto → SÍ (tiene los 3 recursos)',
    q: 'Tengo 1 hierro, 1 cereal y 1 pasto. ¿Puedo comprar una carta de desarrollo?',
    must: [['sí','si ','puedes','puede']],
    mustNot: ['no tienes los recursos necesarios','te faltan recursos para comprar']
  },
]

async function main() {
  let passed = 0, failed = 0
  const results = []

  console.log('\n══════════════════════════════════════')
  console.log('  RE-TEST — Tests fallidos BM1')
  console.log('══════════════════════════════════════\n')

  for (const t of TESTS) {
    process.stdout.write(`[${t.id}] ${t.desc}... `)
    try {
      const { response, agentUsed } = await ask(t.q)
      const ok = containsAll(response, t.must) && containsNone(response, t.mustNot)
      console.log(`${ok ? '✅' : '❌'} agent:${agentUsed}`)
      if (!ok) {
        t.must.forEach((g,i) => { if (!containsAny(response, g)) console.log(`   ⚠ Grupo ${i} no encontrado: ${g.slice(0,4).join('/')}`) })
        t.mustNot.forEach(w => { if (response.toLowerCase().includes(w)) console.log(`   ⚠ No debería decir: "${w}"`) })
      }
      console.log(`   → "${response.slice(0,160).replace(/\n/g,' ')}..."\n`)
      results.push({ id: t.id, passed: ok, response: response.slice(0,300) })
      if (ok) passed++; else failed++
    } catch(e) {
      console.log(`💥 ${e.message}\n`)
      results.push({ id: t.id, passed: false, error: e.message })
      failed++
    }
  }

  const total = passed + failed
  console.log('══════════════════════════════════════')
  console.log(`  RESULTADO: ${passed}/${total} (${Math.round(passed/total*100)}%)`)
  console.log('══════════════════════════════════════\n')

  writeFileSync('/tmp/retest-results.json', JSON.stringify({ passed, failed, total, results }, null, 2))
  if (failed === 0) {
    console.log('🎉 TODOS LOS TESTS PASAN — listo para commit')
  } else {
    console.log(`⚠ ${failed} tests aún fallan — revisar`)
  }
}
main().catch(console.error)
