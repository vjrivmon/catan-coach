#!/bin/bash
# ============================================================
# deploy-fresh.sh — Despliegue completo de catan-coach
# ============================================================
# Uso:
#   ssh gti@ireves.gti-ia.dsic.upv.es
#   cd ~/catan-coach && bash deploy-fresh.sh
#
# Este script asume que:
#   - Docker y Docker Compose están instalados
#   - El repo ya está clonado en ~/catan-coach
#   - Apache está configurado y corriendo como proxy
# ============================================================

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$REPO_DIR/logs/deploy.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$REPO_DIR/logs"
exec > >(tee -a "$LOG_FILE") 2>&1

echo ""
echo "======================================================"
echo "  catan-coach deploy — $TIMESTAMP"
echo "======================================================"

cd "$REPO_DIR"

# ── 1. git pull ──────────────────────────────────────────
echo ""
echo "[1/6] Actualizando código desde GitHub..."
git pull origin master
echo "✓ Código actualizado"

# ── 2. Rebuild + restart ─────────────────────────────────
echo ""
echo "[2/6] Rebuilding contenedores Docker..."
docker compose down
docker compose up -d --build
echo "✓ Contenedores levantados"

# ── 3. Health check Next.js ──────────────────────────────
echo ""
echo "[3/6] Esperando que Next.js esté disponible (máx 60s)..."
ELAPSED=0
until curl -sf http://localhost:3000 > /dev/null 2>&1; do
  if [ $ELAPSED -ge 60 ]; then
    echo "✗ Next.js no respondió en 60 segundos"
    echo "  Revisa los logs: docker compose logs app --tail 30"
    exit 1
  fi
  sleep 3
  ELAPSED=$((ELAPSED + 3))
  echo "  ... esperando ($ELAPSED s)"
done
echo "✓ Next.js responde en http://localhost:3000"

# ── 4. Ingesta de embeddings ─────────────────────────────
echo ""
echo "[4/6] Ejecutando ingesta de embeddings (puede tardar ~5 min)..."
echo "  Ingestando reglas y estrategia en ChromaDB..."
INGEST_RESPONSE=$(curl -sf -X POST http://localhost:3000/api/ingest \
  --max-time 300 \
  -H "Content-Type: application/json" \
  2>&1) || {
  echo "✗ La ingesta falló o expiró"
  echo "  Respuesta: $INGEST_RESPONSE"
  echo "  Puedes reintentarla manualmente:"
  echo "    curl -X POST http://localhost:3000/api/ingest --max-time 300"
  exit 1
}
echo "✓ Ingesta completada: $INGEST_RESPONSE"

# ── 5. Verificar colecciones ChromaDB ───────────────────
echo ""
echo "[5/6] Verificando colecciones en ChromaDB..."
COLLECTIONS=$(curl -sf http://localhost:8000/api/v2/collections 2>&1) || {
  echo "⚠ No se pudo consultar ChromaDB (puede ser v1 API)"
  # Fallback a v1
  COLLECTIONS=$(curl -sf http://localhost:8000/api/v1/collections 2>&1) || {
    echo "✗ ChromaDB no responde"
    docker compose logs chromadb --tail 10
    exit 1
  }
}
echo "✓ Colecciones disponibles: $COLLECTIONS"

# ── 6. Estado final ──────────────────────────────────────
echo ""
echo "[6/6] Estado de los contenedores:"
docker compose ps

echo ""
echo "======================================================"
echo "  ✓ DESPLIEGUE COMPLETADO"
echo "  App accesible en: http://ireves.gti-ia.dsic.upv.es"
echo "======================================================"
