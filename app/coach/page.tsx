'use client'

import Link from 'next/link'
import { AdvisorMode } from '../components/AdvisorMode'

export default function CoachPage() {
  return (
    <div className="flex flex-col h-dvh bg-stone-900">

      {/* Header */}
      <header className="bg-stone-800 border-b border-stone-700 px-4 py-3 flex items-center gap-3 shrink-0 min-h-[56px]">
        <Link
          href="/"
          className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-stone-700 transition-colors shrink-0"
          aria-label="Volver"
        >
          <svg className="w-5 h-5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>

        <div className="w-9 h-9 rounded-full bg-amber-700 flex items-center justify-center shrink-0 overflow-hidden">
          <img
            src="/logo.png"
            alt=""
            className="w-9 h-9 rounded-full object-cover"
            onError={() => {}}
          />
        </div>
        <div className="flex flex-col justify-center">
          <h1 className="text-amber-400 font-semibold text-base leading-tight">Coach en partida</h1>
          <p className="text-stone-400 text-xs leading-tight">Análisis de tablero + recomendación</p>
        </div>
      </header>

      {/* Advisor flow */}
      <div className="flex-1 overflow-hidden">
        <AdvisorMode />
      </div>

    </div>
  )
}
