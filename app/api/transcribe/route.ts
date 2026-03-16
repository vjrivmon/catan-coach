import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/src/config'

export async function POST(req: NextRequest) {
  const apiKey = config.groq.apiKey
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GROQ_API_KEY no configurada. Obtén una en console.groq.com' },
      { status: 500 }
    )
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No se recibió archivo de audio' }, { status: 400 })
    }

    const groqForm = new FormData()
    groqForm.append('file', file, file.name)
    groqForm.append('model', config.groq.whisperModel)
    groqForm.append('language', 'es')
    groqForm.append('response_format', 'json')

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Groq Whisper error:', res.status, errText)
      return NextResponse.json(
        { error: `Error de Groq (${res.status}): ${errText}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json({ text: data.text })
  } catch (err) {
    console.error('Transcribe route error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
