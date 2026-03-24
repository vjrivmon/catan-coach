#!/bin/bash
# start-genetic.sh — Lanza el GeneticAgent API en el Slimbook
# Ejecutar desde ~/RoadToDevOps/ o donde esté catan-advisor-api

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADVISOR_DIR="$HOME/RoadToDevOps/catan-advisor-api"

# Si el script está en catan-coach, buscar catan-advisor-api al lado
if [ ! -d "$ADVISOR_DIR" ]; then
  ADVISOR_DIR="$(dirname "$SCRIPT_DIR")/catan-advisor-api"
fi

if [ ! -d "$ADVISOR_DIR" ]; then
  echo "❌ No se encuentra catan-advisor-api en $ADVISOR_DIR"
  echo "   Asegúrate de que el repo está clonado"
  exit 1
fi

# Verificar que no está ya corriendo
if lsof -i :8001 -sTCP:LISTEN &>/dev/null 2>&1; then
  echo "✅ GeneticAgent ya está corriendo en puerto 8001"
  exit 0
fi

echo "→ Lanzando GeneticAgent en $ADVISOR_DIR..."
cd "$ADVISOR_DIR"

# Activar venv si existe
if [ -d "venv" ]; then
  source venv/bin/activate
elif [ -d ".venv" ]; then
  source .venv/bin/activate
fi

exec uvicorn main:app --host 0.0.0.0 --port 8001 --reload
