/**
 * Server-Sent Events (SSE) helpers compartidos por los endpoints de chat
 * y el cliente. Evita repetir `encoder.encode(\`data: ${JSON.stringify(...)}\n\n\`)`
 * y la lógica de parse del stream.
 */

export type SSEEvent = Record<string, unknown>

const encoder = new TextEncoder()

/** Codifica un objeto JSON como un frame SSE (`data: {...}\n\n`). */
export function encodeSSE(data: SSEEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
}

/**
 * Itera sobre un stream SSE del lado del cliente. Maneja buffering de líneas
 * incompletas (commit `0677e06` fix) y ignora líneas que no empiezan con
 * `data: ` o que no son JSON válido.
 */
export async function* parseSSEStream(response: Response): AsyncGenerator<SSEEvent> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Frames separados por línea en blanco (\n\n). Mantenemos el último
    // fragmento incompleto en el buffer para el siguiente chunk.
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data: ')) continue
        try {
          yield JSON.parse(line.slice(6)) as SSEEvent
        } catch {
          // ignorar líneas malformadas — el stream continúa
        }
      }
    }
  }

  // Flush del buffer residual (último frame si no terminó con \n\n).
  if (buffer.trim()) {
    for (const line of buffer.split('\n')) {
      if (!line.startsWith('data: ')) continue
      try {
        yield JSON.parse(line.slice(6)) as SSEEvent
      } catch { /* ignore */ }
    }
  }
}

/**
 * Crea un `ReadableStream` SSE con manejo estándar de errores.
 * El handler recibe una función `send(event)` lista para enviar frames.
 */
export function createSSEStream(
  handler: (send: (event: SSEEvent) => void) => Promise<void>
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => controller.enqueue(encodeSSE(event))
      try {
        await handler(send)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        send({ type: 'error', message })
      } finally {
        controller.close()
      }
    },
  })
}
