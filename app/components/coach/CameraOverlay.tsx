'use client'

import { useRef, ChangeEvent } from 'react'

interface CameraOverlayProps {
  onClose: () => void
  onCapture: (file: File) => void
}

export function CameraOverlay({ onClose, onCapture }: CameraOverlayProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onCapture(file)
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black">
      {/* Viewfinder */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden"
        style={{ background: 'linear-gradient(160deg,#0d1b2a 0%,#1b2838 60%,#0a3d62 100%)' }}>

        {/* Framing guide */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative" style={{ width: 300, height: 270 }}>
            {/* Corners */}
            {[
              'top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl',
              'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr',
              'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl',
              'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br',
            ].map((cls, i) => (
              <div key={i} className={`absolute w-7 h-7 border-amber-400 ${cls}`} />
            ))}
            {/* Grid */}
            <div className="absolute inset-0 opacity-15"
              style={{
                backgroundImage: 'linear-gradient(rgba(245,158,11,1) 1px,transparent 1px),linear-gradient(90deg,rgba(245,158,11,1) 1px,transparent 1px)',
                backgroundSize: '100px 90px',
              }} />
            {/* Circle guide */}
            <div className="absolute border border-dashed border-amber-400/40 rounded-full"
              style={{ inset: 16 }} />
          </div>
        </div>

        {/* Hint */}
        <div className="absolute bottom-0 left-0 right-0 text-center pb-4 pt-8"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)' }}>
          <p className="text-sm text-white/80">
            <span className="text-amber-400 font-semibold">Centra el tablero</span> dentro del marco
          </p>
          <p className="text-xs text-white/50 mt-1">Todos los hexágonos deben ser visibles</p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-black/90 flex items-center justify-between px-7 py-4 pb-7">
        <button onClick={onClose}
          className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>

        {/* Shutter */}
        <button onClick={() => fileRef.current?.click()}
          className="w-[70px] h-[70px] rounded-full bg-white border-4 border-white/25 flex items-center justify-center active:scale-95 transition-transform">
          <div className="w-[54px] h-[54px] rounded-full bg-white border-2 border-stone-200" />
        </button>

        {/* Gallery / file upload */}
        <button onClick={() => fileRef.current?.click()}
          className="w-11 h-11 rounded-xl bg-stone-700 border border-stone-600 flex items-center justify-center text-stone-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l4-4 4 4 5-5 5 5"/>
          </svg>
        </button>

        <input ref={fileRef} type="file" accept="image/*" capture="environment"
          className="hidden" onChange={handleFile} />
      </div>
    </div>
  )
}
