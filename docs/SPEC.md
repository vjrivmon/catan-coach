# SPEC — Catan Coach

**Fecha:** 12 marzo 2026
**Autor:** Vicente Rivas Monferrer
**Estado:** Cerrado ✅

---

## 1. Problema

Los jugadores nuevos de Catan (Los Colonos de Catán) no tienen un recurso interactivo y adaptativo para aprender las reglas y estrategias del juego. Los manuales son densos, las guías online están dispersas y no se adaptan al nivel del jugador. El resultado es fricción en la primera partida y abandono del juego.

## 2. Solución

Catan Coach: un asistente conversacional basado en RAG que responde dudas sobre reglas y estrategia de Catan, detecta el nivel del jugador de forma silenciosa y progresiva, y sugiere preguntas relacionadas para guiar el aprendizaje sin que el usuario tenga que saber qué preguntar.

## 3. Usuarios

- Un único tipo de usuario: jugador de Catan (principiante a avanzado)
- No hay login ni registro
- El nivel se detecta de forma automática y silenciosa durante la conversación
- La sesión persiste en localStorage (historial + mapa de conceptos vistos)

## 4. Funcionalidades del MVP

### Core
- [x] Chat conversacional en español con el asistente
- [x] RAG sobre reglamento oficial de Catan base (RulesAgent)
- [x] RAG separado sobre guías de estrategia (StrategyAgent)
- [x] RouterAgent: decide si la pregunta va a RulesAgent o StrategyAgent
- [x] Detección silenciosa y progresiva del nivel del jugador
- [x] Sugerencia de 2-3 preguntas relacionadas tras cada respuesta (LLM pequeño)
- [x] Progresión conversacional: el bot menciona temas vistos y sugiere siguientes pasos
- [x] Voz: entrada por Web Speech API (dictado al chat)
- [x] Persistencia en localStorage: historial de sesión + conceptos vistos
- [x] Al retomar sesión: el bot recuerda lo que se trabajó la vez anterior

### UX
- [x] Mobile-first: diseñado para móvil, escalado a escritorio
- [x] Solo interfaz de chat (sin paneles laterales ni barras de progreso)
- [x] Preguntas sugeridas como chips/botones bajo cada respuesta

## 5. Fuera de scope (MVP)

- ❌ Expansiones de Catan (solo juego base)
- ❌ Multijugador o partidas en tiempo real
- ❌ Historial en cloud o sincronización entre dispositivos
- ❌ Análisis de foto del tablero (roadmap futuro)
- ❌ Soporte en inglés (solo español)
- ❌ Login / autenticación
- ❌ Panel de progresión visual separado

## 6. Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js (App Router) |
| LLM principal | gemma3:27b (Ollama, servidor UPV) |
| LLM sugerencias | qwen3:8b (Ollama, servidor UPV) |
| Embeddings | nomic-embed-text (Ollama, servidor UPV) |
| Vector store | ChromaDB |
| Persistencia | localStorage (sin backend de sesión) |
| STT | Web Speech API (nativa del navegador) |
| Arquitectura | Hexagonal (ports & adapters) |

## 7. Agentes del sistema

```
RouterAgent        → clasifica la pregunta: reglas o estrategia
RulesAgent         → RAG sobre reglamento + partida de ejemplo
StrategyAgent      → RAG sobre guías de estrategia
GeneratorAgent     → gemma3:27b → genera respuesta final
SuggestionAgent    → qwen3:8b → genera 2-3 preguntas relacionadas (paralelo)
LevelDetector      → analiza historial y actualiza nivel silenciosamente
ConceptTracker     → registra temas vistos en localStorage
```

## 8. Bases de conocimiento (RAG)

**Rules RAG** (`knowledge/rules/`):
- Reglamento oficial Catan base
- Partida de ejemplo (hexágonos y números fijos)

**Strategy RAG** (`knowledge/strategy/`):
- Estrategia de colocación inicial
- Gestión de recursos
- Control de caminos y asentamientos
- Negociación
- Puertos
- Estrategia general (principiante → avanzado)

## 9. Flujo principal

```
Usuario escribe/dicta pregunta
    → RouterAgent clasifica
    → RulesAgent o StrategyAgent recupera contexto
    → GeneratorAgent genera respuesta (gemma3:27b + contexto RAG)
    → SuggestionAgent genera preguntas relacionadas (qwen3:8b, en paralelo)
    → UI muestra: respuesta + chips de preguntas sugeridas
    → ConceptTracker actualiza localStorage
    → LevelDetector analiza y actualiza nivel silenciosamente
```

## 10. Deploy

- **Fase 1:** Local (desarrollo)
- **Fase 2:** Servidor UPV (producción)
- LLMs y ChromaDB en servidor UPV
- Frontend: Next.js (local o Vercel)

## 11. Deadline

Cuanto antes. Sin fecha fija. Prioridad alta.

---

*SPEC generada por VisiClaw — Catan Coach MVP*
