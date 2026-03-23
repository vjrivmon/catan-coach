'use client'

import { useEffect } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

interface OnboardingTourProps {
  onDone: () => void
}

export function OnboardingTour({ onDone }: OnboardingTourProps) {
  useEffect(() => {
    const driverObj = driver({
      showProgress: true,
      animate: true,
      overlayOpacity: 0.65,
      stagePadding: 8,
      stageRadius: 12,
      allowClose: true,
      onCloseClick: onDone,
      nextBtnText: 'Siguiente →',
      prevBtnText: '← Anterior',
      doneBtnText: 'Empezar',
      progressText: '{{current}} / {{total}}',
      popoverClass: 'catan-tour-popover',
      onDestroyed: onDone,
      steps: [
        {
          element: 'header',
          popover: {
            title: 'Catan Coach',
            description: 'Tu asistente para aprender y mejorar en Catan. Te ayuda con reglas, estrategia y recomendaciones en partida real con IA.',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '[data-tour="mode-select"]',
          popover: {
            title: '3 formas de empezar',
            description: '<b>Escanear tablero</b> — haz una foto a tu partida real.<br/><b>Tablero interactivo</b> — coloca piezas manualmente y recibe consejos en tiempo real.<br/><b>Solo dudas</b> — pregunta sobre reglas y estrategia sin tablero.',
            side: 'top',
            align: 'center',
          },
        },
        {
          element: '[data-tour="board-btn"]',
          popover: {
            title: 'Tablero interactivo',
            description: 'Abre el tablero para colocar tus piezas y las de los rivales. El agente GeneticAgent — entrenado en 40.000 partidas — usa esta información para darte recomendaciones precisas.',
            side: 'bottom',
            align: 'end',
          },
        },
        {
          element: '[data-tour="chat-input"]',
          popover: {
            title: 'Pregunta lo que quieras',
            description: 'Escribe cualquier duda: reglas, costes, estrategia, o pide directamente "¿cuál es mi mejor jugada?".',
            side: 'top',
            align: 'center',
          },
        },
      ],
    })

    // Small delay so DOM is ready
    const t = setTimeout(() => driverObj.drive(), 300)
    return () => { clearTimeout(t); driverObj.destroy() }
  }, [onDone])

  return null
}
