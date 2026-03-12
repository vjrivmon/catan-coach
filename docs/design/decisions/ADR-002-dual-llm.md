# ADR-002: Dual LLM — modelo principal + modelo ligero para sugerencias

**Estado:** Aceptado
**Fecha:** 12 marzo 2026

## Contexto
Generar preguntas sugeridas con el mismo modelo que genera las respuestas (gemma3:27b) añadiría latencia significativa: el usuario esperaría dos llamadas secuenciales al modelo más pesado antes de ver cualquier output.

## Decisión
- **gemma3:27b**: genera la respuesta principal, nutrída del contexto RAG
- **qwen3:8b**: genera las 2-3 preguntas sugeridas EN PARALELO mientras gemma3:27b genera la respuesta

Ambas llamadas se lanzan simultáneamente. El frontend muestra la respuesta cuando llega gemma3:27b y añade los chips de sugerencias cuando llega qwen3:8b (que será antes o al mismo tiempo).

## Consecuencias
- Latencia percibida menor: respuesta y sugerencias aparecen casi simultáneamente
- Coste computacional algo mayor (dos modelos corriendo en paralelo)
- qwen3:8b es suficiente para la tarea de sugerencias: no necesita contexto RAG, solo el historial reciente
