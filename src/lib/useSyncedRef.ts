'use client'
import { useRef } from 'react'
import type { MutableRefObject } from 'react'

/**
 * Mantiene un `MutableRefObject` siempre sincronizado con el `value` del
 * último render. Útil para leer estado fresco desde callbacks que capturan
 * closures (p. ej. handlers de streaming SSE, listeners async, setInterval).
 *
 * Diferencia vs `useRef` + `useEffect`:
 *  - `useEffect` actualiza el ref después del commit → durante el render el
 *    ref puede estar un tick por detrás. Aquí actualizamos en cada render
 *    (síncrono) para que quien lea `ref.current` dentro del render ya vea
 *    el valor nuevo.
 *
 * Sustituye el patrón repetido:
 *   const fooRef = useRef(foo)
 *   fooRef.current = foo
 */
export function useSyncedRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)
  ref.current = value
  return ref
}
