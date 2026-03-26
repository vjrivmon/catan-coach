/**
 * TEST CATAN COACH — Ejecutar en el Slimbook:
 * cd ~/RoadToDevOps/catan-coach && node ~/Downloads/catan-coach-test.mjs
 * (o desde donde lo copies)
 */

const BASE = 'http://localhost:3000'
const COACH = {
  boardSummary: `TU COLOR (Rojo):
  2 poblados: [Arcilla(6=5pts)+Bosque(6=5pts)→10pts/turno] y [Trigo(9=4pts)+Mineral(10=3pts)→7pts/turno]
  2 caminos: e12_15 y e10_12
Azul:
  2 poblados: [Lana(5=4pts)] y [Trigo(8=5pts)]`,
  resources: { wood: 1, clay: 1, cereal: 0, wool: 0, mineral: 0 },
  geneticRecommendation: {
    action: 'build_road',
    actionEs: 'Construir camino',
    score: 1.045,
    reason: 'Expand toward high-value vertices',
    positionContext: {
      mySettlements: ['v15', 'v10'],
      myRoads: ['e12_15', 'e10_12'],
      frontier: ['e15_22 hacia mineral(8)+trigo(5)', 'e10_9 hacia lana(6)+madera(11)']
    }
  }
}

async function ask(label, msg, level = 'beginner', mode = 'coach') {
  console.log(`\n[${label}] "${msg}"`)
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: msg, history: [], userLevel: level,
      seenConcepts: [], mode,
      ...(mode === 'coach' ? { coachState: COACH } : {})
    })
  })
  if (!res.ok) { console.log('  HTTP ERROR:', res.status); return }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let txt = '', rec = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of dec.decode(value, { stream: true }).split('\n')) {
      if (!line.startsWith('data: ')) continue
      try {
        const e = JSON.parse(line.slice(6))
        if (e.type === 'token') txt += e.token
        if (e.type === 'done') rec = e.boardRecommendation ?? null
      } catch {}
    }
  }
  const clean = txt.trim()
  const hasArtifact = /<[a-z_]+\d*>/.test(clean)
  const words = clean.split(/\s+/).length
  console.log(`  Sin artefactos: ${!hasArtifact ? '✅' : '❌ ' + clean.slice(0,30)}`)
  console.log(`  Palabras: ${words} ${words >= 25 && words <= 80 ? '✅' : words < 25 ? '❌ muy corto' : '⚠️ largo'}`)
  console.log(`  Botón tablero: ${rec ? '✅ → ' + rec.position + ' (' + rec.type + ')' : '❌ sin boardRec'}`)
  console.log(`  Texto: "${clean.slice(0, 180)}"`)
}

console.log('═══════════════════════════════════════')
console.log('  CATAN COACH — TEST DE VERIFICACIÓN')
console.log('═══════════════════════════════════════')

// Test 1: Principiante — ¿respuesta corta con justificación real?
await ask('P1 principiante', '¿Qué puedo construir ahora?', 'beginner', 'coach')

// Test 2: Principiante — ¿sin artefactos raros?
await ask('P2 principiante', '¿Hacia dónde construyo el camino?', 'beginner', 'coach')

// Test 3: Avanzado — ¿respuesta larga y analítica?
await ask('P3 avanzado', '¿Cuál es mi equity actual frente a Azul?', 'advanced', 'coach')

// Test 4: ¿Calcula turnos sin pedir info?
await ask('P4 turnos', '¿Cuántos turnos para una ciudad?', 'advanced', 'coach')

// Test 5: Modo aprende — sin tablero
await ask('P5 aprende', '¿Cuánto cuesta un poblado?', 'beginner', 'aprende')

console.log('\n═══════════════════════════════════════')
console.log('  FIN')
console.log('═══════════════════════════════════════')
