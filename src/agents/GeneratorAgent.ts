import type { LLMPort } from '../domain/ports'
import type { Message, UserLevel } from '../domain/entities'
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
    const geneticBlock = gr
      ? `\nRECOMENDACIÓN DEL AGENTE GENÉTICO (93 parámetros, 40K partidas entrenadas):
Acción óptima: ${toEs(gr.action ?? gr.actionEs)} (score=${(gr.score as number).toFixed(3)})
Razonamiento del agente: ${gr.reason}
${gr.alternatives && gr.alternatives.length > 0
  ? `Alternativas: ${gr.alternatives.map((a: any) => `${toEs(a.action ?? a.actionEs)}(${(a.score as number).toFixed(2)})`).join(', ')}`
  : ''}

Tu respuesta debe estar ALINEADA con esta recomendación del agente genético. Explícala al jugador de forma comprensible.`
      : ''

    const vpSummary         = computeVP(coachState.boardSummary, coachState.devCards)
    const productionTable   = computeProductionTable(coachState.boardSummary)

    return `Eres Catan Coach, asistente estratégico en partida real de Catan (juego base, en español).
El juego se llama CATAN. Nunca uses el nombre "El Colonizador" ni "Los Colonos de Catán".

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

ACCIONES POSIBLES con los recursos actuales (ya verificadas):
${computeActions(coachState.resources)}
${geneticBlock}
════════════════════════════════════════
REGLAS DE RESPUESTA OBLIGATORIAS
════════════════════════════════════════
1. PV: Si te preguntan cuántos PV tienes, responde EXACTAMENTE el total calculado arriba. No inventes. No digas 0 si el jugador tiene poblados.
2. PRODUCCIÓN: Si preguntan qué producen sus hexágonos con un número, usa la tabla de producción arriba. Si el número no aparece en la tabla, di claramente que no tienes piezas en hexágonos con ese número.
3. CONSTRUCCIÓN: Si preguntan si pueden construir algo, di SÍ o NO basándote SOLO en las acciones posibles verificadas arriba.
4. RECOMENDACIÓN: Si hay recomendación del Agente Genético, explícala y apóyate en ella. Si no hay, razona con la tabla de producción y recursos actuales.
5. Responde en español. Sin emojis. Nivel del jugador: ${levelLabel}.`
  }

  return `Eres Catan Coach, un asistente experto en el juego de mesa Catan (juego base, en español).
El juego se llama CATAN. Nunca uses el nombre "El Colonizador" ni "Los Colonos de Catán".
Tu misión es ayudar a los jugadores a aprender y mejorar de forma progresiva.

Nivel del usuario: ${levelLabel}. ${conceptsText}

Instrucciones:
- Adapta la profundidad de tu respuesta al nivel detectado.
- Para principiantes: explica conceptos básicos con ejemplos claros.
- Para intermedios: asume conocimiento básico, profundiza en estrategia.
- Para avanzados: habla de optimización, probabilidades y meta-juego.
- Si hay contexto RAG disponible, úsalo como base de tu respuesta.
- Sé conciso pero completo. Responde siempre en español. Sin emojis.
- Si la pregunta no tiene que ver con Catan, redirige amablemente.
- No menciones el nivel del usuario explícitamente a menos que sea relevante.`
}

function buildUserPrompt(message: string, context: string, history: Message[]): string {
  const historyText = history.slice(-6).map(m =>
    `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`
  ).join('\n')

  let prompt = ''
  if (historyText) prompt += `Historial reciente:\n${historyText}\n\n`
  if (context) prompt += `Contexto relevante del reglamento/estrategia:\n${context}\n\n`
  prompt += `Pregunta actual: ${message}`

  return prompt
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
    const userPrompt = buildUserPrompt(message, context, history)

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
