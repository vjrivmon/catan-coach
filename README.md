# Catan Coach

Asistente conversacional para aprender y mejorar en Catan. Basado en RAG dual (reglas + estrategia), arquitectura hexagonal y LLMs open-source en servidor UPV.

## Arquitectura

```
RouterAgent → RulesAgent (ChromaDB rules) → GeneratorAgent (gemma3:27b)
           → StrategyAgent (ChromaDB strategy) ↗
           → SuggestionAgent (qwen3:8b) [paralelo]
```

Hexagonal: `src/domain` → `src/agents` → `src/adapters` → `app/`

## Requisitos

- Node.js 18+
- [Ollama](https://ollama.ai) con modelos:
  - `gemma3:27b` (respuestas principales)
  - `qwen3:8b` (preguntas sugeridas)
  - `nomic-embed-text` (embeddings)
- [ChromaDB](https://www.trychroma.com) corriendo en puerto 8000

## Setup rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar entorno
cp .env.local.example .env.local
# Editar .env.local con tu URL de Ollama y ChromaDB

# 3. Levantar ChromaDB
docker run -p 8000:8000 chromadb/chroma

# 4. Descargar modelos en Ollama
ollama pull gemma3:27b
ollama pull qwen3:8b
ollama pull nomic-embed-text

# 5. Indexar base de conocimiento
npx ts-node --esm scripts/ingest.ts
# O via API: POST http://localhost:3000/api/ingest

# 6. Lanzar
npm run dev
# → http://localhost:3000
```

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | URL del servidor Ollama |
| `MAIN_MODEL` | `gemma3:27b` | Modelo principal (respuestas) |
| `SUGGESTION_MODEL` | `qwen3:8b` | Modelo para sugerencias |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Modelo de embeddings |
| `CHROMA_URL` | `http://localhost:8000` | URL de ChromaDB |

## Base de conocimiento

Los documentos están en `knowledge/`:
- `rules/` → reglamento oficial + partida de ejemplo
- `strategy/` → guías de estrategia (colocación, recursos, caminos, puertos, negociación, general)

Para añadir documentos: añade `.txt` a la carpeta correspondiente y re-lanza la ingesta.

## Features

- Chat en español con streaming en tiempo real
- RAG dual: reglas y estrategia en colecciones separadas
- Detección silenciosa de nivel (principiante / intermedio / avanzado)
- 3 preguntas sugeridas tras cada respuesta (generadas en paralelo)
- Progresión conversacional: el bot menciona conceptos aprendidos en hitos
- Entrada por voz (Web Speech API, solo navegadores compatibles)
- Sesión persistida en localStorage (sin login)
- Mobile-first, funciona como PWA

## Producción (servidor UPV)

Cambia `OLLAMA_BASE_URL` en `.env.local` a la URL del servidor UPV y `CHROMA_URL` a donde esté desplegado ChromaDB.
