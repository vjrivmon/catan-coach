'use client'

import { useEffect } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

interface OnboardingTourProps {
  onDone: () => void
  onOpenBoard: () => void
  onCloseBoard: () => void
}

export function OnboardingTour({ onDone, onOpenBoard, onCloseBoard }: OnboardingTourProps) {
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
      onDestroyed: onDone,

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
              onOpenBoard()
              // Wait for board to render, then advance
              setTimeout(() => driverObj.moveNext(), 400)
            },
          },
        },
        {
          element: '[data-tour="board-overlay"]',
          popover: {
            title: 'El tablero de juego',
            description: 'Toca un vértice para colocar un poblado o ciudad. Toca una arista para colocar un camino. Puedes colocar piezas de todos los jugadores y asignar colores.',
            side: 'bottom',
            align: 'center',
            onPrevClick: () => {
              onCloseBoard()
              setTimeout(() => driverObj.movePrevious(), 400)
            },
          },
        },
        {
          element: '[data-tour="confirm-board-btn"]',
          popover: {
            title: 'Confirmar tablero',
            description: 'Cuando hayas colocado todas las piezas, confirma el tablero. A partir de ahí recibirás recomendaciones basadas en tu posición real.',
            side: 'top',
            align: 'center',
            onNextClick: () => {
              onCloseBoard()
              setTimeout(() => driverObj.moveNext(), 400)
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

    const t = setTimeout(() => driverObj.drive(), 300)
    return () => { clearTimeout(t); driverObj.destroy() }
  }, [onDone, onOpenBoard, onCloseBoard])

  return null
}
