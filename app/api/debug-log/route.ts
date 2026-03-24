import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }
  try {
    const log = readFileSync('/tmp/catan-debug.log', 'utf-8')
    // Return last 8KB
    const tail = log.length > 8192 ? log.slice(-8192) : log
    return new Response(tail, { headers: { 'Content-Type': 'text/plain' } })
  } catch {
    return new Response('Log file not found or empty', { headers: { 'Content-Type': 'text/plain' } })
  }
}
