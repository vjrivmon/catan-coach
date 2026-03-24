# Pendientes Catan Coach — estado 24/03/2026 (fin de sesión)

## ✅ COMPLETADOS HOY

1. ~~Descarte de acción → mostrar recursos actuales~~ → **commit 9bb1190**
2. ~~"Actualizar recursos" reseteando a 0~~ → **commit 9bb1190** (initialValues en ResourceStepperBubble)
3. ~~Tablero sin botón de salir~~ → **commit 9bb1190** (botón X absoluto)
4. ~~OllamaAdapter /api/generate → /api/chat~~ → **commit 00ca743**
5. ~~Modelo llama3.3:70b ignorando system prompt~~ → cambiado a gemma3:27b
6. ~~coachState no llegaba cuando usuario escribía manualmente~~ → **commit 2cbebf0**
7. ~~Historial contaminando respuestas~~ → **commit c340254**
8. ~~Ciudad costaba ladrillo (alucinación gemma)~~ → **commit 9f4a3a5**
9. ~~RAG sin prioridad sobre knowledge base~~ → **commit 8543379**
10. ~~numPlayers siempre 4~~ → **commit 5ab887d**
11. ~~Tests Playwright Fases 1-4~~ → **commit f324bf3**

---

## ⏳ PENDIENTES

### Alta prioridad
- [ ] **Verificar Fases 1-4 en la app real** — Vicente no ha visto funcionar el botón
  "Ver en tablero" + aura SVG. Requiere git pull + restart + tablero configurado + recursos.
- [ ] **Deploy en producción** (ireves.gti-ia.dsic.upv.es)
  - SSH manual → `cd ~/catan-coach && bash deploy-fresh.sh`
  - Ingesta obligatoria primera vez (ChromaDB vacío en servidor)
  - Cambiar `WEBHOOK_SECRET` en docker-compose.yml antes de levantar

### Media prioridad
- [ ] **GeneticAgent API autostart** — hay que lanzar manualmente:
  `cd ~/RoadToDevOps/catan-advisor-api && uvicorn main:app --port 8001 --reload`
  Sin esto el coach funciona pero sin recomendación genética.
- [ ] **roadLength** — se pasa roads.length (nº segmentos) en lugar de longitud del camino
  más largo (necesita DFS). Aceptable como aproximación por ahora.
- [ ] **Tutorial/onboarding** — actualizar con el nuevo flujo (tablero → recursos → recomendación)
- [ ] **Ladrón movible** desde el tablero (mover hex con tap)

### Baja prioridad
- [ ] **Fase C: Puertos** en BoardOverlay (impacto bajo-medio en estrategia)
- [ ] **Modo automático** con agentes PyCatan (GeneticAgent como 3 rivales)
- [ ] **Benchmark completo** — relanzar en Slimbook con gemma3:27b para confirmar 14+/15

---

## Estado del benchmark (24/03)

| Suite | Score | Notas |
|---|---|---|
| Básicas + Sinónimos + Contextuales (15 preg) | 15/15 (100%) |
| Edge cases Catan (12 casos) | 12/12 (100%) real | 3 fallos eran bugs del keyword matcher |

---

## Arquitectura verificada

| Componente | Estado |
|---|---|
| gemma3:27b vía /api/chat | ✅ funciona, sigue instrucciones |
| ChromaDB + RAG | ✅ 17 reglas + 32 estrategia indexados |
| GeneticAgent (Python FastAPI) | ⚠️ funciona pero arranque manual |
| RECOMMENDATION_JSON parser | ✅ gemma lo emite correctamente |
| Fases 1-4 (LLM → tablero visual) | ✅ código OK, pendiente verificar en app |
| deploy-fresh.sh | ✅ listo para ireves |
