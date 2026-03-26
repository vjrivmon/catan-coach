# CLAUDE.md — Catan Coach

> Archivo de contexto para Claude Code. Actualizado tras cada sesión significativa.
> Leer también `HANDOFF.md` para cambios recientes.

---

## Qué es este proyecto

**Catan Coach** — asistente estratégico en tiempo real para partidas de Catan (juego base).
El jugador configura el tablero, los recursos y el turno, y el coach responde sus preguntas
con recomendaciones basadas en un agente genético entrenado (93 parámetros, 40K partidas).

Stack: **Next.js 22 + TypeScript + Ollama (gemma3:27b en servidor UPV VRAIN) + ChromaDB + FastAPI (GeneticAgent)**

---

## Arquitectura

```
app/api/chat/route.ts          ← Endpoint principal SSE
  │
  ├── RouterAgent              ← Clasifica pregunta: rules | strategy | direct | coach
  ├── RulesAgent               ← RAG sobre reglas (ChromaDB)
  ├── StrategyAgent            ← RAG sobre estrategia (ChromaDB)
  ├── BoardStateAgent          ← Pre-computa contexto del tablero (PURO, 0 LLM)
  ├── BoardRecommendationBuilder ← Construye recomendación desde GeneticAgent (PURO, 0 LLM)
  └── NarratorAgent            ← LLM final que narra la recomendación en español

src/adapters/outbound/
  ├── OllamaAdapter            ← /api/chat con roles system/user (NO /api/generate)
  └── ChromaAdapter            ← Embeddings + búsqueda semántica

app/api/coach-recommend/route.ts ← Llama al GeneticAgent FastAPI (localhost:8001)
```

**Regla crítica:** El LLM (NarratorAgent) NUNCA decide. Solo narra datos pre-computados.
Los cálculos (VP, producción, turnos, acciones posibles) se hacen en código, no en el modelo.

---

## Modelos y servicios

| Servicio | Config | Notas |
|---|---|---|
| LLM principal | `gemma3:27b` vía VRAIN UPV | NO llama3.3:70b (ignoraba system prompt con RLHF agresivo) |
| LLM sugerencias | `qwen3:8b` vía VRAIN UPV | SuggestionAgent |
| Embeddings | `nomic-embed-text` | ChromaDB en localhost:8000 |
| GeneticAgent | FastAPI en localhost:8001 | Arranque **MANUAL** requerido |
| Ollama API | `/api/chat` con roles | NUNCA usar `/api/generate` (contamina respuestas) |

`.env.local` (Slimbook):
```
OLLAMA_BASE_URL=https://ollama.gti-ia.upv.es
MAIN_MODEL=gemma3:27b
SUGGESTION_MODEL=qwen3:8b
EMBEDDING_MODEL=nomic-embed-text
CHROMA_URL=http://localhost:8000
COACH_API_URL=http://localhost:8001
```

---

## Estado actual (26/03/2026)

### ✅ Completado y funcionando
- Flujo completo: configuración tablero → recursos → turno → pregunta → respuesta + aura SVG
- NarratorAgent usa `/api/chat` con roles (fix crítico: commit `5ca4de6`)
- OllamaAdapter usa `/api/chat` con roles (commit `00ca743`)
- GeneticAgent conectado a API FastAPI con cromosoma real (93 parámetros)
- RAG con ChromaDB: 17 chunks reglas + 32 chunks estrategia
- Historial filtrado: máximo 4 mensajes, sin mensajes de sistema
- Niveles: principiante (3 frases) / intermedio (4 frases) / avanzado (6-8 frases)
- Tests Playwright Fases 1-4 pasando (14/14 en Slimbook)
- Mobile-first UI con safe area iOS

### ⚠️ Pendientes (ordenados por impacto para producción)

#### Alta — bloquean el deploy
1. **Verificar Fases 1-4 en app real** — el botón "Ver en tablero" + aura SVG no ha sido
   verificado manualmente por Vicente. Código parece OK (tests pasan), pero sin confirmar en vivo.
2. **Deploy en ireves** (`ireves.gti-ia.dsic.upv.es`)
   - Script: `bash deploy-fresh.sh`
   - Cambiar `WEBHOOK_SECRET` en `docker-compose.yml` antes de levantar
   - Primera vez: ingestar ChromaDB (está vacío en servidor)
   - GeneticAgent necesita arranque manual también allí

#### Media — mejoran experiencia
3. **GeneticAgent autostart** — hay que arrancarlo manualmente:
   ```bash
   cd ~/RoadToDevOps/catan-advisor-api && uvicorn main:app --port 8001 --reload
   ```
   Sin esto el coach funciona pero sin recomendación genética (respuesta más genérica).

4. **roadLength incorrecto** — se pasa `roads.length` (nº segmentos) en vez de longitud
   del camino más largo (necesita DFS). Aceptable temporalmente.

5. **Tutorial/onboarding** — contenido desactualizado con el nuevo flujo.

6. **Ladrón movible** desde el tablero — actualmente hay botón "Mover ladrón" pero no
   se puede arrastrar el hex visualmente.

#### Baja
7. **Fase C: Puertos** en BoardOverlay
8. **Modo automático** con agentes PyCatan (3 rivales IA con mismo cromosoma genético)
9. **Benchmark completo** — relanzar `scripts/benchmark.mjs` para confirmar métricas
   con gemma3:27b (último: 15/15 en básicas+sinónimos+contextuales, 12/12 edge cases)

---

## Bugs conocidos / lecciones aprendidas

### Bug crítico ya corregido — NO revertir
**`/api/generate` vs `/api/chat`:**
Todos los fetches a Ollama deben usar `/api/chat` con `messages: [{role: 'system'}, {role: 'user'}]`.
Si se usa `/api/generate` con `prompt: string`, el modelo ignora el system prompt y contamina
respuestas con contexto anterior. Esto afectó a `OllamaAdapter` (fix `00ca743`) y a
`NarratorAgent.streamOllama` (fix `5ca4de6`). No usar `/api/generate` en ningún caso.

### `GeneratorAgent.generateStream` — CÓDIGO ZOMBIE
`src/agents/GeneratorAgent.ts` tiene un método `generateStream` que todavía usa `/api/generate`.
**NO se usa en producción** (el pipeline actual pasa por NarratorAgent), pero existe y tiene el bug.
Considerar eliminarlo o migrarlo para evitar confusión futura.

### gemma3:27b — comportamientos específicos
- Puede emitir tokens de scripts no latinos (Thai, Korean) → `stripNonLatinArtifacts()` en GeneratorAgent los filtra. NarratorAgent **no tiene este filtro** — añadir si aparece el problema.
- Sigue system prompt correctamente con `/api/chat`. Con `/api/generate` lo ignora completamente.
- A veces emite bloques `\`\`\`json` en la respuesta — `stripNonLatinArtifacts()` los elimina.

### Historial conversacional
El cliente envía `history[]` en cada POST. El servidor filtra mensajes de sistema y trunca a 4.
El historial es estado del cliente (React), no del servidor — no persiste entre sesiones de navegador.

---

## Archivos clave

```
app/api/chat/route.ts             ← Pipeline principal
src/agents/NarratorAgent.ts       ← LLM narrador (fix 5ca4de6)
src/agents/BoardStateAgent.ts     ← Pre-cálculos puros
src/agents/BoardRecommendationBuilder.ts ← Lógica recomendación
src/agents/GeneratorAgent.ts      ← ZOMBIE — no se usa, tiene bug /api/generate
src/adapters/outbound/OllamaAdapter.ts   ← fetch a Ollama (fix 00ca743)
scripts/benchmark.mjs             ← Suite de tests automatizados
catan-advisor-api/                ← GeneticAgent (Python FastAPI, repo hermano)
catan-advisor-api/data/best_chromosome.json ← 93 parámetros, 40K partidas
knowledge/rules/                  ← Chunks de reglas para RAG
knowledge/strategy/               ← Chunks de estrategia para RAG
deploy-fresh.sh                   ← Script deploy para ireves
docker-compose.yml                ← Producción (cambiar WEBHOOK_SECRET)
```

---

## Cómo desarrollar

```bash
# Slimbook (hardware local, RTX 4070)
cd ~/RoadToDevOps/catan-coach
source ~/.nvm/nvm.sh && nvm use 22
npm run dev           # localhost:3000

# GeneticAgent (en paralelo, necesario para recomendaciones)
cd ~/RoadToDevOps/catan-advisor-api
uvicorn main:app --port 8001 --reload

# ChromaDB (ya autostart en Slimbook)
# Si no está: docker start catan-chroma

# Tests
npx playwright test --reporter=dot
```

---

## Comunicación VisiClaw ↔ Claude Code

**`HANDOFF.md`** — log de cambios recientes. Siempre actualizar al terminar una sesión:
```markdown
## [fecha] — descripción breve
- Qué se hizo
- Commits relevantes
- Pendientes que quedan
```

VisiClaw (OpenClaw/Telegram) actualiza HANDOFF.md cuando hace fixes remotos.
Claude Code lo actualiza al terminar sesiones de desarrollo.
