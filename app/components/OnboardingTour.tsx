'use client'

import { useEffect, useRef } from 'react'
import { driver, Driver } from 'driver.js'
import 'driver.js/dist/driver.css'

interface OnboardingTourProps {
  onDone: () => void
  onOpenBoard: () => void
  onCloseBoard: () => void
}

export function OnboardingTour({ onDone, onOpenBoard, onCloseBoard }: OnboardingTourProps) {
  // Keep driver instance stable across re-renders
  const driverRef = useRef<Driver | null>(null)
  const onDoneRef = useRef(onDone)
  const onOpenBoardRef = useRef(onOpenBoard)
  const onCloseBoardRef = useRef(onCloseBoard)

  // Keep refs updated without recreating the driver
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
        {
          element: 'header',
          popover: {
            title: 'Catan Coach',
            description: 'Tu asistente personal para aprender y mejorar en Catan. Te guía durante la partida con consejos basados en el estado real del tablero.',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '[data-tour="mode-select"]',
          popover: {
            title: '¿Cómo quieres empezar?',
            description: 'Elige según tu situación:<br/><br/><b>Escanear tablero</b> — haz una foto a tu partida real.<br/><b>Tablero interactivo</b> — coloca las piezas tú mismo.<br/><b>Solo dudas</b> — pregunta sobre reglas sin tablero.',
            side: 'top',
            align: 'center',
          },
        },
        {
          element: '[data-tour="board-btn"]',
          popover: {
            title: 'Tablero interactivo',
            description: 'Toca aquí para abrir el tablero y colocar las piezas de todos los jugadores. Ahora lo abrimos para que veas cómo funciona.',
            side: 'bottom',
            align: 'end',
            onNextClick: () => {
              onOpenBoardRef.current()
              setTimeout(() => driverRef.current?.moveNext(), 600)
            },
          },
        },
        {
          popover: {
            title: 'El tablero de juego',
            description: 'Toca un <b>vértice</b> para colocar un poblado o ciudad. Toca una <b>arista</b> para colocar un camino. Asigna colores a cada jugador. Cuando termines, pulsa <b>Confirmar tablero</b>.',
            align: 'center',
            onPrevClick: () => {
              onCloseBoardRef.current()
              setTimeout(() => driverRef.current?.movePrevious(), 600)
            },
            onNextClick: () => {
              onCloseBoardRef.current()
              setTimeout(() => driverRef.current?.moveNext(), 600)
            },
          },
        },
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
    // No cleanup destroy — we keep the driver alive across re-renders
    return () => { clearTimeout(t) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run only once on mount

  return null
}
