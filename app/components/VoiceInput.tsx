'use client'

import { useState, useRef, useCallback } from 'react'

interface Props {
  onTranscript: (text: string) => void
  disabled?: boolean
}

type VoiceState = 'idle' | 'recording' | 'transcribing'

export function VoiceInput({ onTranscript, disabled }: Props) {
  const [state, setState] = useState<VoiceState>('idle')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    return new Promise<Blob>((resolve) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        chunksRef.current = []
        resolve(blob)
      }
      recorder.stop()
      recorder.stream.getTracks().forEach((t) => t.stop())
    })
  }, [])

  const transcribe = useCallback(async (audioBlob: Blob) => {
    setState('transcribing')
    try {
      const formData = new FormData()
      const ext = audioBlob.type.includes('webm') ? 'webm' : 'ogg'
      formData.append('file', audioBlob, `audio.${ext}`)

      const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Error de transcripción')
      if (data.text?.trim()) onTranscript(data.text.trim() + ' ')
    } catch (err) {
      console.error('Transcription error:', err)
    } finally {
      setState('idle')
    }
  }, [onTranscript])

  const toggle = useCallback(async () => {
    if (state === 'transcribing') return

    if (state === 'recording') {
      const blob = await stopRecording()
      if (blob && blob.size > 0) {
        await transcribe(blob)
      } else {
        setState('idle')
      }
      return
    }

    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg;codecs=opus'

      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.start(250) // collect chunks every 250ms
      mediaRecorderRef.current = recorder
      setState('recording')
    } catch (err) {
      console.error('Microphone access error:', err)
      setState('idle')
    }
  }, [state, stopRecording, transcribe])

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || state === 'transcribing'}
      aria-label={
        state === 'recording' ? 'Detener grabación'
          : state === 'transcribing' ? 'Transcribiendo...'
            : 'Hablar'
      }
      className={`rounded-lg p-2 transition-colors shrink-0 ${
        state === 'recording'
          ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
          : state === 'transcribing'
            ? 'bg-amber-600 text-white cursor-wait'
            : 'hover:bg-stone-600 text-stone-400 hover:text-stone-200 disabled:opacity-40'
      }`}
    >
      {state === 'transcribing' ? (
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
      )}
    </button>
  )
}
