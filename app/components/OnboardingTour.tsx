'use client'

import { useEffect, useRef } from 'react'
import { driver, Driver } from 'driver.js'
import 'driver.js/dist/driver.css'

interface OnboardingTourProps {
  onDone: () => void
  onOpenBoard: () => void
  onCloseBoard: () => void
}

/** Polls until `[data-tour="colors-done"]` appears, then calls cb */
function waitForColorsDone(cb: () => void, maxMs = 120_000) {
  const start = Date.now()
  const tick = () => {
    if (document.querySelector('[data-tour="colors-done"]')) { cb(); return }
    if (Date.now() - start < maxMs) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** Visually disables / enables the driver next button via body class */
function setNextBtnDisabled(disabled: boolean) {
  if (disabled) {
    document.body.classList.add('tour-colors-pending')
  } else {
    document.body.classList.remove('tour-colors-pending')
  }
}

export function OnboardingTour({ onDone, onOpenBoard, onCloseBoard }: OnboardingTourProps) {
  const driverRef = useRef<Driver | null>(null)
  const onDoneRef = useRef(onDone)
  const onOpenBoardRef = useRef(onOpenBoard)
  const onCloseBoardRef = useRef(onCloseBoard)

  useEffect(() => { onDoneRef.current = onDone }, [onDone])
  useEffect(() => { onOpenBoardRef.current = onOpenBoard }, [onOpenBoard])
  useEffect(() => { onCloseBoardRef.current = onCloseBoard }, [onCloseBoard])

  useEffect(() => {
    const driverObj = driver({
      showProgress: true,
      animate: true,
      overlayOpacity: 0.65,
      stagePadding: 8,
      stageRadius: 12,
      allowClose: true,
      nextBtnText: 'Siguiente',
      prevBtnText: 'Anterior',
      doneBtnText: 'Empezar a jugar',
      progressText: '{{current}} de {{total}}',
      popoverClass: 'catan-tour-popover',
      onDestroyed: () => onDoneRef.current(),

      steps: [
        // 1 — Header
        {
          element: 'header',
          popover: {
            title: 'Catan Coach',
            description: 'Tu asistente personal para aprender y mejorar en Catan. Te guía durante la partida con consejos basados en el estado real del tablero.',
            side: 'bottom',
            align: 'center',
          },
        },
        // 2 — Modos de inicio
        {
          element: '[data-tour="mode-select"]',
          popover: {
            title: '¿Cómo quieres empezar?',
            description: 'Elige según tu situación:<br/><br/><b>Escanear tablero</b> — haz una foto a tu partida real.<br/><b>Tablero interactivo</b> — coloca las piezas tú mismo.<br/><b>Solo dudas</b> — pregunta sobre reglas sin tablero.',
            side: 'top',
            align: 'center',
          },
        },
        // 3 — Botón tablero → abre board
        {
          element: '[data-tour="board-btn"]',
          popover: {
            title: 'Tablero interactivo',
            description: 'Toca aquí para abrir el tablero. Lo abrimos ahora para que veas cómo funciona.',
            side: 'bottom',
            align: 'end',
            onNextClick: () => {
              onOpenBoardRef.current()
              setTimeout(() => driverRef.current?.moveNext(), 600)
            },
          },
        },
        // 4 — Selector de color (bloqueado hasta confirmar todos)
        {
          element: '[data-tour="color-picker"]',
          popover: {
            title: 'Elige los colores',
            description: 'Primero asigna un color a cada jugador — toca el tuyo, luego el de cada rival. El botón <b>Siguiente</b> se activará cuando todos los jugadores tengan color.',
            side: 'bottom',
            align: 'center',
            onPopoverRender: () => {
              // Disable next btn immediately; re-enable when colors are done
              setTimeout(() => {
                const alreadyDone = !!document.querySelector('[data-tour="colors-done"]')
                if (!alreadyDone) {
                  setNextBtnDisabled(true)
                  waitForColorsDone(() => setNextBtnDisabled(false))
                }
              }, 50)
            },
            onPrevClick: () => {
              setNextBtnDisabled(false)
              onCloseBoardRef.current()
              setTimeout(() => driverRef.current?.movePrevious(), 600)
            },
            onNextClick: () => {
              if (document.querySelector('[data-tour="colors-done"]')) {
                setNextBtnDisabled(false)
                driverRef.current?.moveNext()
              }
              // If blocked, do nothing (button is visually disabled anyway)
            },
          },
        },
        // 5 — Tablero — anclado al header para no tapar el tablero
        {
          element: 'header',
          popover: {
            title: 'El tablero de juego',
            description: 'Toca un <b>vértice</b> para colocar un poblado o ciudad, y una <b>arista</b> para un camino. Cuando termines, pulsa <b>Confirmar tablero</b>.',
            side: 'bottom',
            align: 'center',
            onNextClick: () => {
              onCloseBoardRef.current()
              setTimeout(() => driverRef.current?.moveNext(), 600)
            },
            onPrevClick: () => {
              setTimeout(() => driverRef.current?.movePrevious(), 200)
            },
          },
        },
        // 6 — Chat input
        {
          element: '[data-tour="chat-input"]',
          popover: {
            title: 'Pregunta lo que quieras',
            description: 'Escribe cualquier duda: reglas, costes de construcción, estrategia, o pide directamente <i>"¿cuál es mi mejor jugada?"</i>',
            side: 'top',
            align: 'center',
          },
        },
      ],
    })

    driverRef.current = driverObj

    const t = setTimeout(() => driverObj.drive(), 300)
    return () => { clearTimeout(t) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
