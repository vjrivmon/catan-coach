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
  // Camino: 1 Madera + 1 Arcilla(Ladrillo)
  lines.push(w >= 1 && c >= 1
    ? '✓ PUEDE construir: Camino (tiene madera y arcilla/ladrillo)'
    : `✗ NO puede Camino (necesita 1 Madera + 1 Arcilla — tiene Madera:${w}, Arcilla:${c})`)
  // Poblado: 1 Madera + 1 Arcilla + 1 Lana + 1 Cereal
  lines.push(w >= 1 && c >= 1 && l >= 1 && t >= 1
    ? '✓ PUEDE construir: Poblado (tiene madera, arcilla, lana y trigo/cereal)'
    : `✗ NO puede Poblado (necesita 1M+1A+1L+1T — tiene M:${w} A:${c} L:${l} T:${t})`)
  // Ciudad: 3 Mineral + 2 Cereal
  lines.push(m >= 3 && t >= 2
    ? '✓ PUEDE construir: Ciudad (tiene mineral y cereal suficientes)'
    : `✗ NO puede Ciudad (necesita 3 Mineral + 2 Cereal — tiene Mineral:${m}, Cereal:${t})`)
  // Carta: 1 Mineral + 1 Lana + 1 Cereal
  lines.push(m >= 1 && l >= 1 && t >= 1
    ? '✓ PUEDE comprar: Carta de desarrollo'
    : `✗ NO puede Carta (necesita 1M+1L+1T — tiene M:${m} L:${l} T:${t})`)

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

    return `Eres Catan Coach, asistente estratégico en partida real de Catan (juego base, en español).
El juego se llama CATAN. Nunca uses el nombre "El Colonizador" ni "Los Colonos de Catán".
Analizas el estado actual del tablero y das recomendaciones concretas y accionables.

COSTES DE CONSTRUCCIÓN (reglas oficiales, NO negociables):
- Camino:           1 Ladrillo (Arcilla) + 1 Madera
- Poblado:          1 Ladrillo (Arcilla) + 1 Madera + 1 Lana (Pasto) + 1 Trigo (Cereal)
- Ciudad:           3 Mineral (Roca) + 2 Trigo (Cereal)   [mejora un poblado existente]
- Carta desarrollo: 1 Mineral + 1 Lana + 1 Trigo

SINÓNIMOS VÁLIDOS: Ladrillo=Arcilla=Barro, Trigo=Cereal=Grano, Mineral=Roca=Piedra, Lana=Pasto=Oveja

ESTADO ACTUAL DEL TABLERO:
${coachState.boardSummary}
${turnBlock}${devBlock}

RECURSOS ACTUALES DEL JUGADOR: ${resourceLine}

ACCIONES POSIBLES (verificadas contra recursos exactos):
${computeActions(coachState.resources)}
${geneticBlock}
Instrucciones:
- Basa TODAS tus respuestas en el estado real del tablero y los recursos exactos indicados arriba.
- Si el jugador pregunta si puede construir algo, responde SÍ o NO claramente.
- Acepta cualquier sinónimo de recursos (trigo/cereal, roca/mineral, ladrillo/arcilla, pasto/lana).
- Responde en español, sin emojis.
- Nivel del jugador: ${levelLabel}.`
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
