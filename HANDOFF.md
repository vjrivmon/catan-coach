# HANDOFF.md — Log de cambios recientes

> Archivo de comunicación entre VisiClaw (OpenClaw) y Claude Code.
> Siempre actualizar al terminar una sesión. Más reciente arriba.

---

## 2026-03-26 — VisiClaw — Fix contaminación cruzada NarratorAgent

**Problema:** Respuestas incorrectas en navegador privado (sin contexto previo). El modelo
respondía cosas del historial de tests en lugar de la pregunta actual.

**Root cause:** `NarratorAgent.streamOllama` usaba `/api/generate` con todo el prompt
concatenado como texto plano. Ollama con `/api/generate` no tiene roles — el modelo
ve un bloque de texto y lo completa con lo que parece contexto conversacional anterior.

**Fix:** Migrado a `/api/chat` con `messages: [{role: 'system'}, {role: 'user'}]`.
Mismo patrón que ya se había aplicado a `OllamaAdapter` en commit `00ca743`.

**Commit:** `5ca4de6` — `fix(narrator): migrate streamOllama to /api/chat with roles`

**Pendiente:** `GeneratorAgent.generateStream` tiene el mismo bug con `/api/generate`
pero es código zombie (no se usa en el pipeline actual). Considerar eliminar.

---

## 2026-03-24 — Última sesión de desarrollo en Slimbook

### Completado
- Cambio modelo: `llama3.3:70b` → `gemma3:27b` (sigue system prompt, sin disclaimers)
- `OllamaAdapter`: `/api/generate` → `/api/chat` con roles (`00ca743`)
- Arquitectura hexagonal completa: NarratorAgent + BoardStateAgent + BoardRecommendationBuilder
- `coachState` fix: dependía de `_coachMode` stale → usa `_boardConfigured` (`2cbebf0`)
- Historial filtrado a 4 mensajes reales, sin mensajes de sistema (`c340254`)
- Anti-disclaimer en system prompt (`b792750`)
- Regla absoluta recursos — nunca recomendar ✗ (`dca1297`)
- `numPlayers` siempre 4 → usa `assignments.length` (`5ab887d`)
- 3 fixes UX: descartar→recursos, stepper pre-rellenado, X en tablero (`9bb1190`)
- Costes oficiales en system prompt modo aprende (`9f4a3a5`)
- RAG como fuente de verdad sobre knowledge base (`8543379`)
- Tests Playwright Fases 1-4 → `f324bf3`
- Benchmark básicas+sinónimos+contextuales: 15/15 (100%)
- Benchmark edge cases: 12/12 (100%)

### Pendiente al terminar esa sesión
- Verificar Fases 1-4 en app real (botón "Ver en tablero" + aura SVG)
- Deploy en `ireves.gti-ia.dsic.upv.es`
- GeneticAgent autostart (arranque manual requerido)
- `roadLength` — DFS pendiente (baja prioridad)
- Tutorial/onboarding actualizado
- Ladrón movible visualmente
