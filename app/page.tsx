'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center h-dvh bg-stone-900 px-6">

      {/* Logo + título */}
      <div className="flex flex-col items-center gap-3 mb-10">
        <div className="w-16 h-16 rounded-2xl bg-amber-700 flex items-center justify-center overflow-hidden">
          <img
            src="/logo.png"
            alt=""
            className="w-16 h-16 rounded-2xl object-cover"
            onError={() => {}}
          />
        </div>
        <h1 className="text-amber-400 font-bold text-2xl">Catan Coach</h1>
        <p className="text-stone-400 text-sm text-center max-w-xs">
          Tu asistente inteligente para aprender y ganar en Catán
        </p>
      </div>

      {/* Dos modos */}
      <div className="flex flex-col gap-4 w-full max-w-sm">

        {/* Aprende Catán */}
        <Link
          href="/aprende"
          className="group flex items-center gap-4 bg-stone-800 hover:bg-stone-750 border border-stone-700 hover:border-amber-600/50 rounded-2xl px-5 py-5 transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-900/50 flex items-center justify-center shrink-0 group-hover:bg-amber-800/60 transition-colors">
            <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-stone-100 font-semibold text-base">Aprende Catán</p>
            <p className="text-stone-400 text-sm mt-0.5">Reglas, estrategias y dudas explicadas por IA</p>
          </div>
          <svg className="w-5 h-5 text-stone-500 group-hover:text-amber-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        {/* Coach en partida */}
        <Link
          href="/coach"
          className="group flex items-center gap-4 bg-stone-800 hover:bg-stone-750 border border-stone-700 hover:border-amber-600/50 rounded-2xl px-5 py-5 transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-900/50 flex items-center justify-center shrink-0 group-hover:bg-amber-800/60 transition-colors">
            <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-stone-100 font-semibold text-base">Coach en partida</p>
            <p className="text-stone-400 text-sm mt-0.5">Foto del tablero + recursos → mejor jugada</p>
          </div>
          <svg className="w-5 h-5 text-stone-500 group-hover:text-amber-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

    </div>
  )
}
