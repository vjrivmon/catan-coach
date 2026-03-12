# Design Summary — Catan Coach

**Fecha:** 12 marzo 2026
**Fase:** 2 — Diseño formal completado

---

## Arquitectura General

Hexagonal (ports & adapters) con Agentic RAG en el dominio.

```
INBOUND PORTS
├── ChatPort          → mensaje de texto del usuario
└── VoicePort         → Web Speech API → texto

DOMINIO
├── ConversationService    → orquesta el flujo completo
├── RouterAgent            → clasifica pregunta: rules | strategy
├── RulesAgent             → retrieval en Rules RAG
├── StrategyAgent          → retrieval en Strategy RAG
├── GeneratorAgent         → gemma3:27b → respuesta final
├── SuggestionAgent        → qwen3:8b → preguntas relacionadas (paralelo)
├── LevelDetector          → análisis silencioso del nivel
└── ConceptTracker         → gestiona mapa de conceptos vistos

OUTBOUND PORTS
├── LLMPort           → Ollama API (UPV) para gemma3:27b y qwen3:8b
├── EmbeddingPort     → Ollama API (UPV) para nomic-embed-text
├── VectorStorePort   → ChromaDB (rules + strategy collections)
└── SessionPort       → localStorage del navegador
```

---

## Entidades del dominio

### Message
- `id`: string
- `role`: 'user' | 'assistant'
- `content`: string
- `timestamp`: Date
- `agentUsed`: 'rules' | 'strategy' | 'direct'
- `suggestedQuestions`: string[]

### ConceptMap
- `topics`: Map<string, ConceptStatus>
- `lastUpdated`: Date

### ConceptStatus
- `seen`: boolean
- `timesDiscussed`: number
- `lastSeen`: Date

### UserLevel
- `level`: 'beginner' | 'intermediate' | 'advanced'
- `confidence`: number (0-1)
- `signals`: string[] (evidencias detectadas)

### Session
- `messages`: Message[]
- `conceptMap`: ConceptMap
- `userLevel`: UserLevel
- `startedAt`: Date
- `lastActiveAt`: Date

---

## Flujo de datos

```
1. Usuario envía mensaje
2. ConversationService lo recibe
3. RouterAgent clasifica → 'rules' | 'strategy' | 'direct'
4. Si rules → RulesAgent recupera top-k chunks de Rules RAG
   Si strategy → StrategyAgent recupera top-k chunks de Strategy RAG
   Si direct → sin retrieval (preguntas conversacionales)
5. En PARALELO:
   a. GeneratorAgent llama gemma3:27b con [system_prompt + context + history + query]
   b. SuggestionAgent llama qwen3:8b con [history + query + level]
6. Frontend recibe respuesta (stream) + sugerencias
7. ConceptTracker detecta temas en la respuesta y actualiza localStorage
8. LevelDetector analiza historial y actualiza UserLevel silenciosamente
9. Si nivel cambia o nuevo concepto importante → bot inserta mensaje de progresión
```

---

## System Prompts (esquema)

### GeneratorAgent (gemma3:27b)
```
Eres Catan Coach, un asistente experto en el juego de mesa Catan (juego base, en español).
Tu rol es ayudar a los jugadores a aprender y mejorar.
Nivel detectado del usuario: {level}
Conceptos ya vistos: {conceptMap}
Adapta tu respuesta al nivel. Sé conciso pero completo.
Si la pregunta no tiene que ver con Catan, redirige amablemente.
Contexto recuperado: {rag_context}
```

### SuggestionAgent (qwen3:8b)
```
Dado este historial de chat sobre Catan y el nivel del usuario ({level}),
genera exactamente 3 preguntas de seguimiento que el usuario podría querer hacer.
Las preguntas deben: cubrir el tema actual en más profundidad, un tema adyacente, y un concepto del siguiente nivel.
Devuelve solo las 3 preguntas como lista JSON: ["pregunta1", "pregunta2", "pregunta3"]
```

---

## Decisiones arquitectónicas

| ADR | Decisión |
|-----|----------|
| ADR-001 | Dos RAGs separados: rules + strategy |
| ADR-002 | Dual LLM: gemma3:27b principal + qwen3:8b sugerencias en paralelo |

---

## Estructura de carpetas del proyecto

```
catan-chatbot/
├── docs/
│   ├── SPEC.md
│   └── design/
│       ├── DESIGN-SUMMARY.md
│       ├── c4/
│       ├── domain/
│       ├── flows/
│       └── decisions/
├── knowledge/
│   ├── rules/
│   └── strategy/
└── src/
    ├── domain/
    │   ├── agents/
    │   ├── entities/
    │   ├── services/
    │   └── ports/
    ├── adapters/
    │   ├── inbound/    (Next.js API routes, UI)
    │   └── outbound/   (Ollama, ChromaDB, localStorage)
    └── app/            (Next.js App Router)
```

---

*Diseño completado. Pendiente: documentos RAG (sub-agente en ejecución) → Fase 3: Implementación*
