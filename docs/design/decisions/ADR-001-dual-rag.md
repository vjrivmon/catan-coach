# ADR-001: Dos RAGs separados para reglas y estrategia

**Estado:** Aceptado
**Fecha:** 12 marzo 2026

## Contexto
El chatbot necesita responder tanto dudas de reglas (objetivas, basadas en el reglamento) como preguntas de estrategia (subjetivas, basadas en experiencia). Mezclar ambos documentos en un único vector store genera contaminación: una pregunta de reglas puede recuperar fragmentos de estrategia y viceversa, degradando la precisión.

## Decisión
Dos ChromaDB collections independientes:
- `rules_collection`: reglamento oficial + partida de ejemplo
- `strategy_collection`: guías de estrategia curadas

Un RouterAgent clasifica cada pregunta antes de decidir qué collection consultar.

## Consecuencias
- Mayor precisión en retrieval
- Complejidad añadida: RouterAgent debe clasificar correctamente
- Facilita el mantenimiento: actualizar reglas no afecta estrategias
