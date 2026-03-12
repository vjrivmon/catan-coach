# Knowledge Summary — Catan Coach RAG

**Fecha:** 12 marzo 2026
**Total palabras:** ~12.400 | **Total archivos:** 8

---

## Rules RAG (`knowledge/rules/`)

| Archivo | Palabras | Contenido |
|---------|----------|-----------|
| `reglamento-completo.txt` | ~2.800 | Componentes, terrenos, preparación, turnos, construcción, comercio, cartas de desarrollo, condición de victoria, variantes |
| `partida-ejemplo.txt` | ~1.430 | Tablero fijo para principiantes: posición exacta de hexágonos, números, puertos y ejemplo de primeros turnos |

**Fuente:** Reglamento oficial Catan 5ª edición (Catan Studio, 2020)

---

## Strategy RAG (`knowledge/strategy/`)

| Archivo | Palabras | Contenido |
|---------|----------|-----------|
| `estrategia-colocacion-inicial.txt` | ~1.590 | Sistema de pips, criterios de elección, errores típicos, casos especiales |
| `estrategia-recursos.txt` | ~1.340 | Gestión de mano, cuándo guardar vs gastar, recursos prioritarios por fase |
| `estrategia-caminos-asentamientos.txt` | ~1.350 | Expansión, bloqueo, cuándo priorizar caminos vs ciudades |
| `estrategia-negociacion.txt` | ~1.420 | Cuándo comerciar, con quién, cómo evitar ayudar al líder |
| `estrategia-puertos.txt` | ~1.420 | Tipos de puerto, cuándo vale la pena especializarse, estrategia de puerto 2:1 |
| `estrategia-general.txt` | ~1.080 | Visión global: 5 principios básicos, mecánicas avanzadas, 3 caminos a la victoria, errores más comunes |

**Fuentes:** BoardGameGeek Strategy Guides, Reddit r/Catan, reglamento oficial

---

## Recomendaciones de chunking

### Rules RAG
- `chunk_size`: 400 tokens
- `overlap`: 80 tokens
- Separador: por sección (`## `) — preserva la coherencia de cada regla

### Strategy RAG
- `chunk_size`: 350 tokens
- `overlap`: 70 tokens
- Separador: por subsección (`### `) — cada estrategia específica en su propio chunk

---

## Notas de calidad

- Todos los documentos están en español, texto plano limpio, sin markdown complejo
- Estructura consistente: `## Sección` / `### Subsección`
- Sin duplicados entre Rules y Strategy RAG — los contextos son completamente separados
- La partida de ejemplo incluye posiciones fijas de hexágonos y números como se pedía
- Estrategia general cubre principiante → avanzado con ejemplos concretos

## Gaps conocidos
- No incluye estrategias específicas para 3 jugadores vs 4 (diferencias tácticas)
- No cubre el modo Capitán del Mare (variante oficial del juego base)
- Las guías de estrategia son curadas/sintetizadas, no extraídas de un documento oficial único
