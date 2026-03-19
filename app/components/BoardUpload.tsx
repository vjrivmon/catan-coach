'use client'

import { useState, useRef, DragEvent, ChangeEvent } from 'react'

interface BoardState {
  hexes: unknown[]
  vertices: unknown[]
  ports: unknown[]
  [key: string]: unknown
}

interface BoardUploadProps {
  onConfirm: (boardState: BoardState, confirmationText: string) => void
}

export function BoardUpload({ onConfirm }: BoardUploadProps) {
  const [image, setImage] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ boardState: BoardState; text: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Por favor selecciona una imagen.')
      return
    }
    setImageFile(file)
    setResult(null)
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => setImage(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  async function analyzeBoard() {
    if (!imageFile) return
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('image', imageFile)
      const res = await fetch('http://localhost:8000/vision/analyze', {
        method: 'POST',
        body: form,
      })
      if (!res.ok) throw new Error(`Error del servidor: ${res.status}`)
      const data = await res.json()
      setResult({ boardState: data.board_state ?? data, text: data.confirmation ?? 'Tablero analizado correctamente.' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      if (msg.includes('fetch') || msg.includes('Failed')) {
        setError('El servidor de análisis no está disponible. Asegúrate de que catan-advisor-api está corriendo en http://localhost:8000.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-stone-300 text-sm">Sube una foto del tablero para que analice la disposición de recursos y números.</p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors min-h-[180px] ${
          dragging ? 'border-amber-500 bg-amber-950/20' : 'border-stone-600 hover:border-stone-500 bg-stone-800/50'
        }`}
      >
        {image ? (
          <img src={image} alt="Vista previa del tablero" className="max-h-48 max-w-full rounded-lg object-contain" />
        ) : (
          <>
            <svg className="w-10 h-10 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-stone-400 text-sm text-center px-4">Arrastra una foto del tablero o <span className="text-amber-400">haz clic para seleccionar</span></p>
            <p className="text-stone-500 text-xs">PNG, JPG, WEBP</p>
          </>
        )}
        <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} className="hidden" />
      </div>

      {image && !result && (
        <button
          onClick={analyzeBoard}
          disabled={loading}
          className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl py-2.5 px-4 text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analizando tablero...
            </>
          ) : 'Analizar tablero'}
        </button>
      )}

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-stone-800 rounded-xl p-4 border border-stone-700 flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-green-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-stone-200 text-sm">{result.text}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setImage(null); setImageFile(null); setResult(null) }}
              className="flex-1 bg-stone-700 hover:bg-stone-600 text-stone-300 rounded-xl py-2 text-sm transition-colors"
            >
              Cambiar foto
            </button>
            <button
              onClick={() => onConfirm(result.boardState, result.text)}
              className="flex-1 bg-amber-600 hover:bg-amber-500 text-white rounded-xl py-2 text-sm font-medium transition-colors"
            >
              Continuar →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
