# Catan Coach

Asistente conversacional para aprender y mejorar en Catan. RAG dual (reglas + estrategia), arquitectura hexagonal y LLMs open-source vía servidor UPV VRAIN.

## Arquitectura

```
Usuario
  ↓
RouterAgent → RulesAgent    (ChromaDB catan_rules)    → GeneratorAgent (gemma3:27b)
           → StrategyAgent  (ChromaDB catan_strategy) ↗
           → SuggestionAgent (qwen3:8b) [paralelo]
           → GeneticAgent API (FastAPI, Python) [coach mode]
```

Hexagonal: `src/domain` → `src/agents` → `src/adapters` → `app/`

## Modos de uso

| Modo | Activación | Descripción |
|---|---|---|
| **Aprende** | "Solo dudas" | Preguntas de reglas y estrategia sin tablero |
| **Coach** | Tablero interactivo / Escanear | Análisis en partida real con recomendaciones visuales |

### Flujo Coach completo
1. Configura el tablero con tus piezas y las de los rivales
2. Indica tus recursos en mano
3. El LLM + GeneticAgent recomiendan la mejor jugada
4. Pulsa **"Ver en tablero"** → aura SVG pulsante sobre la posición recomendada
5. Confirma la jugada o descártala (se muestran tus recursos actuales)

## Requisitos

- Node.js 18+
- Ollama con modelos: `gemma3:27b`, `qwen3:8b`, `nomic-embed-text`
- ChromaDB (Docker) en puerto 8000
- Python 3.9+ con FastAPI para el GeneticAgent (opcional, mejora recomendaciones)

## Setup rápido (Slimbook / desarrollo local)

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar entorno
cp .env.local.example .env.local
# Editar OLLAMA_BASE_URL, MAIN_MODEL, CHROMA_URL

# 3. ChromaDB
docker run -d -p 8000:8000 --name catan-chroma chromadb/chroma
# O si ya existe: docker start catan-chroma

# 4. Indexar conocimiento
# Opción A — script:
CHROMA_URL=http://localhost:8000 npx tsx scripts/ingest.ts
# Opción B — con el servidor corriendo:
curl -X POST http://localhost:3000/api/ingest

# 5. GeneticAgent (opcional pero recomendado)
bash start-genetic.sh
# O manualmente:
# cd ~/RoadToDevOps/catan-advisor-api && uvicorn main:app --port 8001 --reload

# 6. Lanzar frontend
npm run dev
# → http://localhost:3000
```

## Variables de entorno

| Variable | Valor Slimbook | Descripción |
|---|---|---|
| `OLLAMA_BASE_URL` | `https://ollama.gti-ia.upv.es` | Servidor Ollama UPV |
| `OLLAMA_INSECURE` | `true` | Certificado autofirmado UPV |
| `MAIN_MODEL` | `gemma3:27b` | Modelo principal |
| `SUGGESTION_MODEL` | `qwen3:8b` | Modelo para sugerencias |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Embeddings RAG |
| `CHROMA_URL` | `http://localhost:8000` | ChromaDB local |
| `COACH_API_URL` | `http://localhost:8001` | GeneticAgent FastAPI |

## Base de conocimiento RAG

`knowledge/rules/` (17 chunks) — fuente: reglamento oficial Catan 5ª ed. 2020
`knowledge/strategy/` (32 chunks) — fuente: BoardGameGeek, Reddit r/Catan

Documentación completa: [`docs/RAG-KNOWLEDGE-SOURCES.md`](docs/RAG-KNOWLEDGE-SOURCES.md)

## Features implementadas

### Core
- Chat en español con streaming en tiempo real
- RAG dual: reglas (`catan_rules`) y estrategia (`catan_strategy`)
- RouterAgent: clasifica preguntas en reglas / estrategia / conversacional
- Detección silenciosa de nivel: principiante → intermedio → avanzado
- 3 preguntas sugeridas tras cada respuesta (qwen3:8b en paralelo)
- Historial de conversaciones en localStorage (sin login)
- Mobile-first, PWA

### Modo Coach
- BoardOverlay SVG interactivo: colocar piezas, asignar colores, mover ladrón
- 9 puertos clickeables en el borde del tablero (5 específicos 2:1 + 4 genéricos 3:1)
- ResourceStepper: indicar recursos en mano, pre-rellenado en actualizaciones
- GeneticAgent: 93 parámetros entrenados en 40.000 partidas
- Recomendación visual: aura SVG pulsante (vértices y aristas) con confirmación/descarte
- DiceInputBubble: introducción manual de dado, producción automática
- Ladrón automático al sacar 7: tablero se abre en modo "mover ladrón"
- DevCardStepper: seguimiento de cartas de desarrollo
- ActionMenu: acciones contextuales en chip bar (móvil + desktop)
- longestRoad DFS: cálculo real del camino más largo para el GeneticAgent

### Sistema prompt
- Costes oficiales hardcodeados (inmune a alucinaciones del modelo)
- Sinónimos de recursos (arcilla=ladrillo, cereal=trigo, etc.)
- Instrucción: contexto RAG tiene PRIORIDAD sobre conocimiento base del modelo
- PV pre-calculados, tabla de producción por dado, acciones ✓/✗ verificadas matemáticamente
- Instrucción anti-disclaimer: PROHIBIDO decir "no tengo información"

## Producción (ireves.gti-ia.dsic.upv.es)

```bash
ssh gti@ireves.gti-ia.dsic.upv.es
cd ~/catan-coach
bash deploy-fresh.sh   # git pull + Docker rebuild + ingesta + verificación
```

Ver [`DEPLOYMENT.md`](DEPLOYMENT.md) para detalles completos.

## Tests

```bash
# Playwright (requiere npm run dev corriendo)
npx playwright test --reporter=list

# Benchmark LLM (requiere ChromaDB)
node scripts/benchmark.mjs
```

## Benchmark (24/03/2026)

| Suite | Score | Modelo |
|---|---|---|
| Básicas + Sinónimos + Contextuales (15 preg) | 14/15 (93%) | gemma3:27b |
| Edge cases Catan (12 casos) | 12/12 (100%) | gemma3:27b |
| Benchmark completo (27 preg) | 26/27 (96%) | gemma3:27b |

## Estructura

```
app/
  api/chat/          → streaming endpoint, RAG + LLM
  api/coach-recommend/ → proxy GeneticAgent con positionContext
  api/ingest/        → ingesta ChromaDB vía HTTP
  api/debug-log/     → leer /tmp/catan-debug.log (solo dev)
  components/
    ChatInterface.tsx   → estado principal (1200+ líneas)
    MessageBubble.tsx   → burbujas con botón "Ver en tablero"
    coach/
      BoardOverlay.tsx  → tablero SVG, puertos, ladrón, aura SVG
      ResourceStepperBubble.tsx
      DiceInputBubble.tsx
      DevCardStepper.tsx
      ActionMenu.tsx
src/
  domain/entities/    → Message, Session, BoardRecommendation
  agents/             → RouterAgent, GeneratorAgent, RulesAgent, StrategyAgent
  adapters/outbound/  → OllamaAdapter (/api/chat), ChromaAdapter
  lib/boardGeometry.ts → geometría SVG, buildBoardSummary, DFS longestRoad
knowledge/
  rules/              → reglamento, partida ejemplo, sinónimos
  strategy/           → 6 documentos de estrategia
docs/
  RAG-KNOWLEDGE-SOURCES.md → documentación fuentes RAG (para TFG)
tests/
  e2e.spec.ts
  recommendation-flow.spec.ts  → tests Fases 1-4
  punto3.spec.ts
```
