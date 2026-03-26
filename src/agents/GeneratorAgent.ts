import type { LLMPort } from '../domain/ports'
import type { Message, UserLevel, BoardRecommendation } from '../domain/entities'
import type { CoachState } from './SuggestionAgent'
import { config } from '../config'
import { debugLog } from '../lib/debugLog'

export interface GeneticRecommendation {
  action: string
  actionEs: string
  score: number
  reason: string
  alternatives: Array<{ action: string; actionEs: string; score: number; reason: string }>
}

/** Pre-compute what the player can build with their current resources */
function computeActions(resources: Record<string, number> | null): string {
  if (!resources) return '- Recursos no especificados aún'
  const w = resources.wood    ?? 0
  const c = resources.clay    ?? 0
  const l = resources.wool    ?? 0
  const t = resources.cereal  ?? 0
  const m = resources.mineral ?? 0

  const lines: string[] = []
  lines.push(w >= 1 && c >= 1
    ? '✓ PUEDE construir: Camino (tiene madera y arcilla/ladrillo)'
    : `✗ NO puede Camino (necesita 1 Madera + 1 Arcilla — tiene Madera:${w}, Arcilla:${c})`)
  lines.push(w >= 1 && c >= 1 && l >= 1 && t >= 1
    ? '✓ PUEDE construir: Poblado (tiene madera, arcilla, lana y trigo/cereal)'
    : `✗ NO puede Poblado (necesita 1M+1A+1L+1T — tiene M:${w} A:${c} L:${l} T:${t})`)
  lines.push(m >= 3 && t >= 2
    ? '✓ PUEDE construir: Ciudad (tiene mineral y cereal suficientes)'
    : `✗ NO puede Ciudad (necesita 3 Mineral + 2 Cereal — tiene Mineral:${m}, Cereal:${t})`)
  lines.push(m >= 1 && l >= 1 && t >= 1
    ? '✓ PUEDE comprar: Carta de desarrollo'
    : `✗ NO puede Carta (necesita 1M+1L+1T — tiene M:${m} L:${l} T:${t})`)

  return lines.join('\n')
}

/** Pre-compute current VP from board summary so LLM never has to count */
function computeVP(boardSummary: string, devCards: Record<string,number> | null | undefined): string {
  // Count settlements (1 PV) and cities (2 PV) from TU COLOR section
  // boardSummary lines like "  N poblados: ..." and "  N ciudades: ..."
  let settlements = 0
  let cities = 0

  const settMatch = boardSummary.match(/TU COLOR[^]*?(\d+)\s+poblado/)
  const cityMatch  = boardSummary.match(/TU COLOR[^]*?(\d+)\s+ciudad/)
  if (settMatch) settlements = parseInt(settMatch[1])
  if (cityMatch)  cities      = parseInt(cityMatch[1])

  const structureVP = settlements * 1 + cities * 2
  const cardVP      = devCards?.vp ?? 0
  const totalVP     = structureVP + cardVP

  const parts: string[] = []
  if (settlements > 0) parts.push(`${settlements} poblado${settlements > 1 ? 's' : ''} × 1 PV = ${settlements} PV`)
  if (cities > 0)      parts.push(`${cities} ciudad${cities > 1 ? 'es' : ''} × 2 PV = ${cities * 2} PV`)
  if (cardVP > 0)      parts.push(`${cardVP} carta${cardVP > 1 ? 's' : ''} VP oculta = ${cardVP} PV`)
  if (parts.length === 0) parts.push('Sin piezas en el tablero aún')

  return `${parts.join(' + ')} → TOTAL = ${totalVP} PV (necesitas 10 para ganar)`
}

/**
 * Pre-compute which resources the player produces per dice number.
 * Parses the boardSummary terrain(number=Xpts) tokens from TU COLOR section.
 */
function computeProductionTable(boardSummary: string): string {
  // Extract all terrain(number=Xpts) tokens from TU COLOR section only
  const mySection = boardSummary.match(/TU COLOR[^]*?(?=\n[A-Z]|$)/)
  if (!mySection) return 'Sin posiciones propias en el tablero'

  // Match: terreno(número=Nptsˌ...) — e.g. "trigo(11=2pts)" or "madera(8=5pts,LADRÓN)"
  const tokenRe = /(\w+)\((\d+)=(\d+)pts(,LADRÓN)?\)/g
  const byNumber: Map<number, { terrains: string[]; blocked: boolean }> = new Map()

  let match
  while ((match = tokenRe.exec(mySection[0])) !== null) {
    const [, terrain, numStr, , robber] = match
    const num = parseInt(numStr)
    if (num < 2 || num > 12 || num === 7) continue
    if (!byNumber.has(num)) byNumber.set(num, { terrains: [], blocked: false })
    const entry = byNumber.get(num)!
    if (!entry.terrains.includes(terrain)) entry.terrains.push(terrain)
    if (robber) entry.blocked = true
  }

  if (byNumber.size === 0) return 'No hay hexágonos con número asociados a tus piezas'

  const lines: string[] = []
  for (const [num, { terrains, blocked }] of [...byNumber.entries()].sort((a, b) => a[0] - b[0])) {
    const label = blocked ? ` (BLOQUEADO por ladrón)` : ''
    lines.push(`  Dado ${num}: produces ${terrains.join(' + ')}${label}`)
  }
  return lines.join('\n')
}

function buildSystemPrompt(level: UserLevel, seenConcepts: string[] | undefined, coachState?: CoachState): string {
  const levelLabel = level === 'beginner' ? 'principiante' : level === 'intermediate' ? 'intermedio' : 'avanzado'
  const concepts = seenConcepts ?? []
  const conceptsText = concepts.length > 0
    ? `Conceptos ya vistos en esta sesión: ${concepts.join(', ')}.`
    : 'Es la primera sesión del usuario.'

  if (coachState?.boardSummary && coachState.boardSummary !== 'Tablero vacío') {
    // Translate resource keys to Spanish for clarity
    const RES_ES: Record<string, string> = {
      wood: 'Madera', clay: 'Arcilla', cereal: 'Trigo/Cereal',
      wool: 'Lana', mineral: 'Mineral',
    }
    const resourceLine = coachState.resources
      ? Object.entries(coachState.resources)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${RES_ES[k] ?? k}×${v}`)
          .join(', ') || 'ninguno'
      : 'no especificados aún'

    // Turn + dev cards context
    const turnBlock = coachState.turn
      ? `\nTURNO ACTUAL: ${coachState.turn}`
      : ''
    const devBlock = coachState.devCards && Object.values(coachState.devCards).some(v => v > 0)
      ? `\nCARTAS DE DESARROLLO EN MANO: ${
          Object.entries(coachState.devCards)
            .filter(([,v]) => v > 0)
            .map(([k,v]) => {
              const names: Record<string,string> = { knight:'Caballero', monopoly:'Monopolio', year_of_plenty:'Año Abundancia', road_building:'Construcción Caminos', vp:'Punto Victoria' }
              return `${names[k]??k}×${v}`
            }).join(', ')
        }`
      : ''

    const ACTION_ES: Record<string, string> = {
      build_settlement: 'Construir poblado',
      build_city:       'Construir ciudad',
      build_road:       'Construir camino',
      buy_dev_card:     'Comprar carta de desarrollo',
      trade:            'Comerciar',
      play_dev_card:    'Jugar carta de desarrollo',
      pass:             'Pasar turno',
    }
    const toEs = (a: string) => ACTION_ES[a] ?? a

    const gr = coachState.geneticRecommendation as any
    // Position context from route topology pre-computation
    const pc = gr?.positionContext as { mySettlements?: string[]; myRoads?: string[]; frontier?: string[] } | undefined

    const positionBlock = pc ? `
POSICIONES CONCRETAS DEL JUGADOR:
Poblados/Ciudades: ${pc.mySettlements?.join(' | ') || 'ninguno'}
Caminos actuales: ${pc.myRoads?.join(' | ') || 'ninguno'}
VÉRTICES DE EXPANSIÓN (extremos de tus caminos sin poblado):
${pc.frontier?.length ? pc.frontier.map(f => `  → ${f}`).join('\n') : '  (ninguno disponible)'}

Cuando recomiendes construir un camino o poblado, indica SIEMPRE el vértice concreto de destino usando la descripción de terrenos adyacentes de la lista anterior.` : ''

    const geneticBlock = gr
      ? `\nRECOMENDACIÓN DEL AGENTE GENÉTICO (93 parámetros, 40K partidas entrenadas):
Acción óptima: ${toEs(gr.action ?? gr.actionEs)} (score=${(gr.score as number).toFixed(3)})
Razonamiento del agente: ${gr.reason}
${gr.alternatives && gr.alternatives.length > 0
  ? `Alternativas: ${gr.alternatives.map((a: any) => `${toEs(a.action ?? a.actionEs)}(${(a.score as number).toFixed(2)})`).join(', ')}`
  : ''}
${positionBlock}
REGLA OBLIGATORIA: Si recomiendas construir un camino o poblado, indica exactamente hacia qué terrenos expandirte usando los vértices de expansión listados arriba. No digas "expandirte hacia nuevas áreas" sin especificar cuáles.`
      : ''

    // La instrucción RECOMMENDATION_JSON siempre presente en modo coach con tablero
    // Usar IDs reales de la frontera si están disponibles
    const frontierIds = pc?.frontier?.map(f => {
      const match = f.match(/^(v\d+|e\d+_\d+)/)
      return match ? match[1] : null
    }).filter(Boolean) ?? []

    const recommendationInstruction = `
════════════════════════════════════════
INSTRUCCIÓN DE RECOMENDACIÓN EN TABLERO
════════════════════════════════════════
Cuando recomiendes colocar una pieza física (camino, poblado o ciudad), AÑADE al final de tu respuesta este bloque EXACTO (última línea, sin espacios extra):
RECOMMENDATION_JSON:{"type":"road|settlement|city","position":"eX_Y o vN","label":"descripción breve"}
${frontierIds.length > 0
  ? `IDs de posición válidos para esta partida: ${frontierIds.join(', ')}
Usa SIEMPRE uno de estos IDs en el campo "position". No inventes IDs.`
  : 'Usa el formato vN para vértices (poblado/ciudad) o eA_B para aristas (camino).'}
Ejemplos válidos:
RECOMMENDATION_JSON:{"type":"road","position":"e30_38","label":"hacia mineral(10)+arcilla(6)"}
RECOMMENDATION_JSON:{"type":"settlement","position":"v42","label":"cereal(5)+lana(9)+madera(3)"}
RECOMMENDATION_JSON:{"type":"city","position":"v10","label":"mineral(10)+trigo(12)"}
Si NO recomiendas una pieza física concreta, NO incluyas el bloque RECOMMENDATION_JSON.`

    const vpSummary         = computeVP(coachState.boardSummary, coachState.devCards)
    const productionTable   = computeProductionTable(coachState.boardSummary)

    return `Eres Catan Coach, asistente estratégico en partida real de Catan (juego base, en español).
El juego se llama CATAN. Nunca uses el nombre "El Colonizador" ni "Los Colonos de Catán".

INSTRUCCIÓN CRÍTICA: Tienes acceso COMPLETO al estado actual de la partida. Toda la información necesaria está en este prompt (tablero, recursos, producción, VP). NO digas frases como "no tengo información sobre tu situación", "necesitaría conocer tus recursos" o "no puedo ver el tablero". Esa información ya está aquí abajo. Úsala directamente para dar una recomendación específica y accionable.

════════════════════════════════════════
COSTES DE CONSTRUCCIÓN (NO negociables)
════════════════════════════════════════
- Camino:           1 Ladrillo (Arcilla) + 1 Madera
- Poblado:          1 Ladrillo + 1 Madera + 1 Lana (Pasto) + 1 Trigo (Cereal)
- Ciudad:           3 Mineral (Roca) + 2 Trigo  ← mejora un POBLADO EXISTENTE, no se construye desde cero
- Carta desarrollo: 1 Mineral + 1 Lana + 1 Trigo

SINÓNIMOS: Ladrillo=Arcilla=Barro=Adobe, Trigo=Cereal=Grano, Mineral=Roca=Piedra=Hierro, Lana=Pasto=Oveja=Fibra, Madera=Leña=Tronco=Árbol

════════════════════════════════════════
ESTADO DEL TABLERO (fuente de verdad)
════════════════════════════════════════
${coachState.boardSummary}
${turnBlock}${devBlock}

════════════════════════════════════════
RECURSOS EN MANO: ${resourceLine}
════════════════════════════════════════

PUNTOS DE VICTORIA ACTUALES (ya calculados — úsalos directamente, NO recalcules):
${vpSummary}

PRODUCCIÓN POR NÚMERO DE DADO (tus piezas):
${productionTable}

ACCIONES POSIBLES con los recursos actuales (verificadas matematicamente — NO las ignores):
${computeActions(coachState.resources)}

⚠️ REGLA ABSOLUTA DE RECURSOS: Las marcadas con ✗ son IMPOSIBLES con los recursos actuales. NUNCA recomiendes una accion ✗. Si todas son ✗, recomienda pasar el turno o comerciar.
${geneticBlock}
${recommendationInstruction}
════════════════════════════════════════
REGLAS DE RESPUESTA OBLIGATORIAS
════════════════════════════════════════
1. PV: Si te preguntan cuántos PV tienes, responde EXACTAMENTE el total calculado arriba. No inventes. No digas 0 si el jugador tiene poblados.
2. PRODUCCIÓN: Si preguntan qué producen sus hexágonos con un número, usa la tabla de producción arriba. Si el número no aparece en la tabla, di claramente que no tienes piezas en hexágonos con ese número.
3. CONSTRUCCIÓN: Si preguntan si pueden construir algo, di SÍ o NO basándote SOLO en las acciones posibles verificadas arriba.
4. RECOMENDACIÓN: Recomienda SOLO acciones marcadas ✓. Si hay Agente Genético úsalo como guía. Si todas las acciones son ✗, recomienda pasar turno o comerciar con el banco/jugadores.
5. Responde SIEMPRE en español. Sin emojis. Sin palabras en otros idiomas. Nivel del jugador: ${levelLabel}.
6. PROHIBIDO ABSOLUTO: No uses frases como "no tengo información", "no puedo ver el tablero", "aunque no puedo ver el tablero", "necesitaría conocer", "necesitamos conocer", "para calcular eso necesito", "no tengo acceso al estado". El estado COMPLETO del tablero está en este prompt. Úsalo directamente para calcular y dar una respuesta concreta con números exactos.
7. PROHIBIDO: Recomendar acciones marcadas ✗ o afirmar que el jugador tiene recursos que no tiene.
8. PROHIBIDO ABSOLUTO: No menciones en ningún caso el "Agente Genético", "GeneticAgent", "agente", "algoritmo", "IA interna", "sistema de análisis" ni ninguna referencia a cómo se calcula la recomendación. Presenta siempre la recomendación como tuya, de forma natural y directa.
${levelLabel === 'principiante'
  ? `8. NIVEL PRINCIPIANTE — REGLAS ESTRICTAS DE RESPUESTA:
   - Máximo 2 frases. No más.
   - Da UNA sola recomendación. Sin alternativas.
   - NUNCA uses IDs de vértice (v15, e12_34...). Usa siempre descripción de terrenos: "el hexágono de mineral(8)", "hacia el bosque del 6 y el trigo del 9".
   - Frase 1: di QUÉ construir, QUÉ recursos necesita y hacia QUÉ terrenos. Ejemplo: "Construye un camino (1 madera + 1 arcilla) hacia el hexágono de mineral(8) y trigo(5)."
   - Frase 2: justifica brevemente por qué en lenguaje simple. Ejemplo: "Así te acercas a más recursos y podrás colocar un poblado ahí más adelante."
   - NO termines con una pregunta abierta. La justificación va integrada en la respuesta.`
  : levelLabel === 'intermedio'
  ? `8. NIVEL INTERMEDIO — REGLAS DE RESPUESTA:
   - Máximo 4 frases. Sé directo.
   - NUNCA uses IDs de vértice (v15, e12_34...). Usa siempre descripción de terrenos.
   - Da la mejor jugada con su coste y una alternativa si existe. No más de dos opciones.
   - Puedes mencionar la razón estratégica en una frase.`
  : `8. NIVEL AVANZADO — REGLAS DE RESPUESTA:
   - Responde SIEMPRE en español. Nunca en otro idioma. Si detectas que vas a escribir en otro idioma, detente y escribe en español.
   - Análisis completo con alternativas y razonamiento estratégico.
   - Máximo 6-8 frases. Sé denso en información, no en palabras.
   - Puedes mencionar IDs de vértice (v15, e12_34) solo si los acompañas de la descripción del terreno.
   - PROHIBIDO ABSOLUTO: No digas "necesitamos conocer", "necesitaría saber", "para saberlo necesito", "necesito saber qué recursos producen tus poblados" ni ninguna variante. Esa información YA ESTÁ en este prompt en "PRODUCCIÓN POR NÚMERO DE DADO" y "ESTADO DEL TABLERO". Léela y úsala.
   - Si la pregunta implica calcular turnos o producción: mira la sección "PRODUCCIÓN POR NÚMERO DE DADO" de este mismo prompt, suma los recursos que produces por dado, estima la probabilidad (dado 6 = 5/36 ≈ 14%, dado 8 = 5/36 ≈ 14%, dado 9 = 4/36 ≈ 11%, dado 10 = 3/36 ≈ 8%) y da un número concreto de turnos estimados. No pidas nada al usuario.`
}`
  }

  return `Eres Catan Coach, un asistente experto en el juego de mesa Catan (juego base, en español).
El juego se llama CATAN. Nunca uses el nombre "El Colonizador" ni "Los Colonos de Catán".
Tu misión es ayudar a los jugadores a aprender y mejorar de forma progresiva.

════════════════════════════════════════
COSTES DE CONSTRUCCIÓN OFICIALES (NO modificables)
════════════════════════════════════════
- Camino:           1 Ladrillo (arcilla/barro) + 1 Madera (tronco/leña)
- Poblado:          1 Ladrillo + 1 Madera + 1 Lana (pasto/oveja) + 1 Trigo (cereal/grano)
- CIUDAD:           3 MINERAL (roca/piedra/hierro) + 2 TRIGO (cereal/grano)  ← NO lleva ladrillo ni madera
- Carta desarrollo: 1 Mineral + 1 Lana + 1 Trigo

SINÓNIMOS: Ladrillo=Arcilla=Barro, Trigo=Cereal=Grano, Mineral=Roca=Piedra=Hierro, Lana=Pasto=Oveja, Madera=Leña=Tronco

Nivel del usuario: ${levelLabel}. ${conceptsText}

Instrucciones generales:
- REGLA DE FUENTES: Si hay "Contexto relevante" al final de este prompt, úsalo como FUENTE DE VERDAD sobre el reglamento.
- Cuando te pregunten por costes, usa SIEMPRE la tabla de arriba.
- Responde siempre en español. Sin emojis.
- Si la pregunta no tiene que ver con Catan, redirige amablemente.
- No menciones el nivel del usuario explícitamente.

${levelLabel === 'principiante'
  ? `NIVEL PRINCIPIANTE — instrucciones de respuesta:
- Máximo 3 frases simples. Una idea por respuesta.
- Cuando menciones una construcción, incluye siempre su coste exacto en la misma frase. Ejemplo: "Un camino cuesta 1 madera y 1 arcilla."
- NUNCA uses IDs de vértice ni términos técnicos sin explicar. Usa nombres de terrenos visibles: "el hexágono de mineral", "el bosque del 6".
- Si la respuesta necesita más contexto, termina con "¿Quieres que te explique más?"`
  : levelLabel === 'intermedio'
  ? `NIVEL INTERMEDIO — instrucciones de respuesta:
- Máximo 5 frases. Ve al grano.
- Asume que el usuario conoce las reglas básicas. No expliques qué es un poblado.
- Puedes mencionar probabilidades, ventajas posicionales y estrategia básica.
- Si hay varias opciones, menciona la mejor y una alternativa como máximo.`
  : `NIVEL AVANZADO — instrucciones de respuesta:
- Respuesta completa con análisis estratégico si la pregunta lo requiere.
- Usa terminología técnica (pips, equity, control de mesa, tempo).
- Máximo 8 frases. Sé denso en información, no en palabras.`
}`
}

function buildUserPrompt(message: string, context: string, history: Message[], hasCoachState: boolean): string {
  const historyText = history.slice(-6).map(m =>
    `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`
  ).join('\n')

  let prompt = ''
  if (historyText) prompt += `Historial reciente:\n${historyText}\n\n`
  if (context) prompt += `Contexto relevante del reglamento/estrategia:\n${context}\n\n`

  // When coach state is present, remind the model that all data is already in the system prompt
  // so it doesn't ask for information it already has
  if (hasCoachState) {
    prompt += `[RECUERDA: El tablero, recursos, producción por dado y acciones posibles están en el system prompt. Responde directamente con datos concretos. No pidas información adicional.]\n\n`
  }

  prompt += `Pregunta actual: ${message}`

  return prompt
}

/** Extract RECOMMENDATION_JSON block from full LLM response, return cleaned text + parsed rec */
export function extractRecommendation(fullText: string): {
  cleanText: string
  recommendation: BoardRecommendation | null
} {
  const MARKER = 'RECOMMENDATION_JSON:'
  const idx = fullText.lastIndexOf(MARKER)
  if (idx === -1) return { cleanText: fullText.trim(), recommendation: null }

  const before  = fullText.slice(0, idx).trimEnd()
  const jsonPart = fullText.slice(idx + MARKER.length).trim()

  // Find the JSON object boundaries
  const start = jsonPart.indexOf('{')
  const end   = jsonPart.lastIndexOf('}')
  if (start === -1 || end === -1) return { cleanText: before, recommendation: null }

  try {
    const raw = JSON.parse(jsonPart.slice(start, end + 1)) as Record<string, unknown>
    const type = raw.type as string
    const position = raw.position as string
    const label = (raw.label as string) ?? ''

    if (!type || !position) return { cleanText: before, recommendation: null }
    if (!['road','settlement','city'].includes(type)) return { cleanText: before, recommendation: null }

    return {
      cleanText: before,
      recommendation: { type: type as BoardRecommendation['type'], position, label },
    }
  } catch {
    return { cleanText: before, recommendation: null }
  }
}

export class GeneratorAgent {
  constructor(private llm: LLMPort) {}

  async *generateStream(
    message: string,
    context: string,
    history: Message[],
    level: UserLevel,
    seenConcepts: string[] | undefined,
    coachState?: CoachState
  ): AsyncIterable<string> {
    const systemPrompt = buildSystemPrompt(level, seenConcepts, coachState)
    debugLog.systemPrompt(systemPrompt)
    debugLog.llmStart(config.ollama.mainModel)
    const userPrompt = buildUserPrompt(message, context, history, !!coachState)

    const ollamaUrl = `${config.ollama.baseUrl}/api/generate`
    const body = JSON.stringify({
      model: config.ollama.mainModel,
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      stream: true,
    })

    const response = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    if (!response.ok || !response.body) {
      throw new Error(`Ollama error: ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          if (parsed.response) yield parsed.response
          if (parsed.done) return
        } catch { /* ignore parse errors */ }
      }
    }
  }
}
