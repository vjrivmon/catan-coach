/**
 * Debug logger — writes to /tmp/catan-debug.log
 * Follow in real time with: tail -f /tmp/catan-debug.log
 */
import { appendFileSync } from 'fs'

const LOG_PATH = '/tmp/catan-debug.log'
const ENABLED = process.env.NODE_ENV !== 'production'

function ts() {
  return new Date().toISOString()
}

function write(level: string, section: string, data: unknown) {
  if (!ENABLED) return
  const line = `[${ts()}] [${level}] [${section}] ${JSON.stringify(data, null, 0)}\n`
  try { appendFileSync(LOG_PATH, line) } catch { /* silent */ }
}

export const debugLog = {
  /** Called when /api/chat receives a request */
  chatRequest(params: {
    message: string
    mode: string
    coachState?: unknown
    userLevel: string
  }) {
    write('REQ', 'chat', params)
  },

  /** Called when /api/coach-recommend receives a request */
  coachRequest(params: {
    resources: unknown
    settlements: unknown
    roads: unknown
    vp: number
    turn?: number
  }) {
    write('REQ', 'coach-recommend', params)
  },

  /** Called when GeneticAgent responds */
  coachResponse(params: {
    action: string
    score: number
    reason: string
    alternatives?: unknown
  }) {
    write('RES', 'genetic-agent', params)
  },

  /** Called with the actual system prompt sent to the LLM */
  systemPrompt(prompt: string) {
    write('PROMPT', 'llm', { length: prompt.length, preview: prompt.slice(0, 300) })
  },

  /** Called when LLM starts streaming */
  llmStart(model: string) {
    write('LLM', 'stream-start', { model })
  },

  /** Called when LLM finishes */
  llmEnd(params: { chars: number; agentUsed: string }) {
    write('LLM', 'stream-end', params)
  },

  /** Called on any error */
  error(section: string, err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    write('ERROR', section, { message: msg })
  },
}
