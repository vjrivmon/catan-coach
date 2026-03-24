# Pendientes Catan Coach (sesión 24/03/2026)

## 1. Descarte de acción → mostrar recursos actuales
Cuando el LLM recomienda una acción (aparece el BoardOverlay con la pieza recomendada)
y el usuario pulsa "Descartar":
- Mostrar los recursos actuales en mano
- NO resetear a 0 — mantener los recursos confirmados previamente

**Contexto:** El usuario tenía Madera:1, Trigo:1, Mineral:1. Al descartar se ponía todo a 0.

---

## 2. Botón "Actualizar recursos" reseteando a 0
Cuando el usuario pulsa "Actualizar recursos", los recursos se ponen a cero en lugar
de mostrar el stepper con los valores actuales pre-rellenados.

**Fix esperado:** El ResourceStepper debe abrirse con los valores actuales como estado inicial.

---

## 3. Tablero interactivo sin botón de salir
En el modal del tablero interactivo solo hay "Confirmar tablero" y "Limpiar".
No hay forma de salir sin confirmar — el usuario tiene que reiniciar la app.

**Fix esperado:** 
- Añadir botón X (cerrar) en la esquina del modal del tablero
- Solo visible cuando el tablero ya fue configurado previamente (para no perder datos accidentalmente)
- Al pulsar X → cerrar sin confirmar, conservando el estado anterior

---

## Estado tras sesión 24/03
- ✅ OllamaAdapter migrado a /api/chat con roles system/user
- ✅ Historial limpiado antes de enviar al LLM
- ✅ coachState siempre se envía cuando boardConfigured=true
- ✅ Modelo cambiado a gemma3:27b (llama3.3:70b ignoraba system prompt)
- ✅ Instrucciones anti-disclaimer y regla absoluta de recursos en system prompt
- ⏳ Pendiente verificar con gemma3:27b que ya no alucina recursos (último fix: dca1297)
