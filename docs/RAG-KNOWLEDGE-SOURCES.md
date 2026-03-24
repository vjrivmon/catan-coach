# Fuentes de Conocimiento del Sistema RAG — Catan Coach

**Proyecto:** Catan Coach (TFG GTI 2026 — Vicente Rivas Monferrer)
**Componente:** Base de Conocimiento para Retrieval-Augmented Generation (RAG)
**Fecha de elaboración:** Marzo 2026

---

## 1. Visión General

El sistema RAG de Catan Coach se compone de **8 documentos de texto** organizados en dos colecciones temáticas, indexados en ChromaDB mediante embeddings vectoriales generados con el modelo `nomic-embed-text` (Ollama).

| Colección | Documentos | Chunks indexados | Propósito |
|---|---|---|---|
| `catan_rules` | 3 archivos | 17 chunks | Reglas oficiales del juego |
| `catan_strategy` | 6 archivos | 32 chunks | Estrategia y táctica |
| **Total** | **9 archivos** | **49 chunks** | |

Cada chunk tiene aproximadamente 400 tokens con solapamiento de 80 tokens para preservar la coherencia semántica entre fragmentos adyacentes.

---

## 2. Colección de Reglas (`catan_rules`)

### 2.1 Reglamento Completo (`reglamento-completo.txt`)
**Extensión:** ~318 líneas / ~2.800 palabras

**Fuente:** Reglamento oficial de *CATAN* (5ª Edición, 2020). Autor: Klaus Teuber. Editorial: Catan Studio / Kosmos.

**Contenido cubierto:**
- Componentes del juego (hexágonos, fichas de número, caminos, poblados, ciudades, cartas)
- Tipos de terreno y recursos asociados (bosque→madera, colinas→ladrillo, montaña→mineral, campo→cereal, prado→lana)
- Preparación del tablero (fijo para principiantes y variable)
- Configuración inicial (colocación de puertos, fichas de número, ladrón)
- Fase de colocación inicial (2 rondas, orden de juego)
- Turno de juego: producción de recursos, comercio, construcción
- Costes de construcción (camino, poblado, ciudad, carta de desarrollo)
- Casos especiales: el ladrón al sacar 7, cartas de caballero, cartas de progreso, cartas de punto de victoria
- Condición de victoria (10 puntos de victoria)
- Cartas especiales: Camino más Largo (5+ segmentos, 2 PV), Ejército más Grande (3+ caballeros, 2 PV)

### 2.2 Partida de Ejemplo (`partida-ejemplo.txt`)
**Extensión:** ~233 líneas / ~1.430 palabras

**Fuente:** Configuración oficial recomendada para la primera partida, extraída del reglamento oficial (5ª Edición). Diseñada por Catan Studio para tablero equilibrado.

**Contenido cubierto:**
- Posición exacta de los 19 hexágonos de terreno en el tablero fijo
- Posición de las 18 fichas de número (2-12, sin 7)
- Posición de los 9 puertos (5 específicos 2:1 y 4 genéricos 3:1)
- Ejemplo de colocación inicial de poblados y caminos para 4 jugadores
- Ilustración de los primeros turnos de partida con producción de recursos

### 2.3 Guía de Sinónimos (`sinonimos-recursos.txt`)
**Extensión:** ~118 líneas

**Fuente:** Elaboración propia basada en las variantes lingüísticas del reglamento oficial (ediciones en castellano) y vocabulario popular de jugadores hispanohablantes.

**Contenido cubierto:**
- Tabla de equivalencias para los 5 recursos: `ladrillo = arcilla = barro = adobe`, `trigo = cereal = grano = espiga`, `mineral = roca = piedra = hierro = metal`, `lana = pasto = oveja = fibra = vellón`, `madera = leña = tronco = árbol = tabla`
- Tabla de costes de construcción con todos los sinónimos
- Ejemplos de preguntas con sinónimos y respuestas correctas esperadas
- Regla de distancia entre poblados
- Tabla de producción por tipo de terreno

---

## 3. Colección de Estrategia (`catan_strategy`)

### 3.1 Estrategia General (`estrategia-general.txt`)
**Extensión:** ~123 líneas / ~1.080 palabras

**Fuentes:**
- Guías de estrategia de **BoardGameGeek** (BGG) — comunidad de jugadores de mesa, mayor foro especializado del mundo
- Hilos de discusión de **Reddit r/Catan** (subreddit con >100.000 miembros)
- Principios derivados del análisis estadístico del juego

**Contenido cubierto:**
- 5 principios básicos para principiantes: diversificación de recursos, importancia de los números 6 y 8, expansión antes que ciudad, bloqueo estratégico, comercio como herramienta
- Mecánicas avanzadas: control de mesa, uso de cartas de desarrollo, gestión del ladrón
- 3 caminos a la victoria: vía ciudades, vía expansión, vía cartas de desarrollo
- Errores más comunes y cómo evitarlos

### 3.2 Estrategia de Colocación Inicial (`estrategia-colocacion-inicial.txt`)
**Extensión:** ~196 líneas / ~1.590 palabras

**Fuentes:** BGG Strategy Guides, análisis matemático del sistema de *pips* (puntos de probabilidad por ficha de número).

**Contenido cubierto:**
- Sistema de pips: probabilidad de cada número (6 y 8 = 5 pips, 5 y 9 = 4 pips, etc.)
- Criterios de elección del primer y segundo poblado
- Diversificación vs. especialización de recursos
- Importancia de los puertos en la colocación inicial
- Bloqueo de rivales
- Errores típicos de principiantes y casos especiales

### 3.3 Estrategia de Recursos (`estrategia-recursos.txt`)
**Extensión:** ~174 líneas / ~1.340 palabras

**Fuentes:** BGG Strategy Guides, Reddit r/Catan.

**Contenido cubierto:**
- Gestión de la mano de cartas (cuándo guardar, cuándo gastar)
- Recursos prioritarios en cada fase de la partida (apertura, medio juego, final)
- Cuándo priorizar ladrillo+madera (caminos/poblados) vs. mineral+cereal (ciudades)
- Gestión del ladrón: cuándo y a quién colocárselo
- Estrategia ante el dado 7: minimizar cartas en mano

### 3.4 Estrategia de Caminos y Asentamientos (`estrategia-caminos-asentamientos.txt`)
**Extensión:** ~177 líneas / ~1.350 palabras

**Fuentes:** BGG Strategy Guides, análisis de topología del tablero estándar.

**Contenido cubierto:**
- Cuándo priorizar caminos vs. ciudades vs. cartas de desarrollo
- Técnicas de expansión: alcanzar hexágonos de alta producción
- Técnicas de bloqueo: cortar la expansión de rivales
- Estrategia del Camino más Largo: cuándo vale la pena perseguirlo
- El error más común: construir caminos sin dirección estratégica

### 3.5 Estrategia de Negociación (`estrategia-negociacion.txt`)
**Extensión:** ~185 líneas / ~1.420 palabras

**Fuentes:** BGG Strategy Guides, Reddit r/Catan, teoría de juegos aplicada.

**Contenido cubierto:**
- Cuándo es beneficioso comerciar y cuándo no
- Con quién comerciar: evitar beneficiar al líder
- Técnicas de negociación: cómo pedir sin revelar estrategia
- Uso del banco como alternativa (4:1 o 2:1 con puerto)
- Bloqueo comercial: cuándo negarse a comerciar

### 3.6 Estrategia de Puertos (`estrategia-puertos.txt`)
**Extensión:** ~206 líneas / ~1.420 palabras

**Fuentes:** BGG Strategy Guides, análisis estadístico de eficiencia de puertos.

**Contenido cubierto:**
- Tipos de puerto: 5 puertos 2:1 (uno por recurso) y 4 puertos genéricos 3:1
- Valor de cada puerto según la producción del jugador
- Estrategia de especialización: construir en puerto 2:1 del recurso que más produces
- Cuándo el puerto genérico 3:1 es suficiente
- Interacción entre puertos y la estrategia de recursos

---

## 4. Proceso de Indexación

### Pipeline de Ingesta

```
knowledge/*.txt
      ↓
Chunking (400 tokens, overlap 80)
      ↓
Embedding con nomic-embed-text (768 dimensiones)
via Ollama API → servidor UPV VRAIN
      ↓
ChromaDB (colecciones catan_rules / catan_strategy)
```

### Modelo de Embedding
- **Modelo:** `nomic-embed-text` (Nomic AI, 2024)
- **Dimensiones:** 768
- **Servidor:** Ollama en servidor UPV VRAIN (`ollama.gti-ia.upv.es`)
- **Justificación:** Modelo open-source de alta calidad para embeddings de texto en español, sin coste por llamada

### Parámetros de Chunking
| Colección | chunk_size | overlap | Separador preferido |
|---|---|---|---|
| Rules | 400 tokens | 80 tokens | Por sección (`## `) |
| Strategy | 400 tokens | 100 tokens | Por sección (`## `/`### `) |

### Consulta (Retrieval)
En cada consulta del usuario:
1. Se genera el embedding de la pregunta con `nomic-embed-text`
2. Se buscan los `k=3` chunks más similares (similitud coseno) en la colección relevante (reglas o estrategia, según el RouterAgent)
3. Los chunks recuperados se inyectan en el prompt del LLM como "Contexto relevante del reglamento/estrategia"
4. El LLM tiene instrucción explícita de que este contexto tiene **prioridad** sobre su conocimiento base

---

## 5. Limitaciones y Consideraciones

### Alcance
- El knowledge base cubre únicamente el **juego base de CATAN** (5ª edición, 2020)
- No incluye expansiones (Navegantes, Ciudades y Caballeros, etc.)
- El reglamento está basado en la edición en castellano

### Construcción del conocimiento
- Los documentos de reglas se basan en el reglamento oficial publicado por Catan Studio
- Los documentos de estrategia son síntesis elaboradas a partir de fuentes secundarias (BGG, Reddit r/Catan) y no están extraídos directamente de ninguna obra con derechos de autor
- La guía de sinónimos es de elaboración propia

### Actualización
- El knowledge base es estático (no se actualiza automáticamente)
- Para añadir nueva información: añadir archivos `.txt` a `knowledge/rules/` o `knowledge/strategy/` y re-ejecutar la ingesta con `POST /api/ingest`

---

## 6. Referencias

| Fuente | Tipo | URL |
|---|---|---|
| Reglamento CATAN 5ª Edición (2020) | Fuente primaria | catan.com |
| BoardGameGeek — CATAN Strategy | Fuente secundaria | boardgamegeek.com/boardgame/13/catan |
| Reddit r/Catan | Fuente secundaria | reddit.com/r/Catan |
| nomic-embed-text | Modelo de embedding | huggingface.co/nomic-ai/nomic-embed-text-v1 |
| ChromaDB | Base de datos vectorial | trychroma.com |
| Ollama | Servidor LLM local | ollama.ai |
