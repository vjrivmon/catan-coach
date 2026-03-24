#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start-all.sh — Levanta todos los servicios de Catan Coach
#
# Servicios:
#   :8000  ChromaDB     (RAG — reglas y estrategia)
#   :8001  GeneticAgent (FastAPI Python — recomendaciones IA)
#   :3000  Next.js      (frontend)
#
# Uso:
#   ./start-all.sh          # lanza todo
#   ./start-all.sh --stop   # mata todos los procesos
#   ./start-all.sh --status # muestra estado de cada servicio
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ── Rutas (ajusta si tu estructura es distinta) ───────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR"                                    # catan-coach/
ADVISOR_DIR="$(dirname "$SCRIPT_DIR")/catan-advisor-api"     # ../catan-advisor-api/
CHROMA_PATH="$HOME/.chroma/catan-chroma"                     # volumen de ChromaDB

CHROMA_PORT=8000
ADVISOR_PORT=8001
FRONTEND_PORT=3000

LOG_DIR="$SCRIPT_DIR/.logs"
mkdir -p "$LOG_DIR"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo -e "${BOLD}[start-all]${NC} $*"; }
ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "  ${RED}✗${NC} $*"; }

port_in_use() { lsof -ti :"$1" > /dev/null 2>&1; }

wait_for_port() {
  local port=$1 label=$2 timeout=${3:-30} i=0
  printf "  Esperando %s (:%s)" "$label" "$port"
  until lsof -ti :"$port" > /dev/null 2>&1; do
    sleep 1; i=$((i+1)); printf "."
    if [ $i -ge $timeout ]; then echo; warn "Timeout esperando $label"; return 1; fi
  done
  echo; ok "$label listo en :$port"
}

# ── --stop ────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--stop" ]]; then
  log "Deteniendo servicios..."
  for port in $CHROMA_PORT $ADVISOR_PORT $FRONTEND_PORT; do
    pids=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill -TERM 2>/dev/null || true
      ok "Proceso en :$port detenido"
    else
      warn "Nada corriendo en :$port"
    fi
  done
  exit 0
fi

# ── --status ──────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--status" ]]; then
  log "Estado de servicios:"
  for entry in "$CHROMA_PORT:ChromaDB" "$ADVISOR_PORT:GeneticAgent" "$FRONTEND_PORT:Next.js"; do
    port="${entry%%:*}"; label="${entry##*:}"
    if port_in_use "$port"; then
      ok "$label — corriendo en :$port"
    else
      err "$label — NO corriendo (:$port libre)"
    fi
  done
  exit 0
fi

# ── kill_port: mata todo lo que ocupe un puerto ──────────────────────────────
kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -TERM 2>/dev/null || true
    sleep 0.8
    # SIGKILL si sigue vivo
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    [ -n "$pids" ] && echo "$pids" | xargs kill -KILL 2>/dev/null || true
    ok "Proceso en :$port terminado"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# INICIO
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║        CATAN COACH — start-all       ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── 0. Sincronizar repos + matar servicios ────────────────────────────────────
log "0/3  Sincronizando repos..."

# Frontend (este mismo repo)
if git -C "$FRONTEND_DIR" rev-parse --is-inside-work-tree &>/dev/null; then
  git -C "$FRONTEND_DIR" pull --rebase --autostash 2>&1 | tail -1 | sed 's/^/  /'
  ok "catan-coach sincronizado"
else
  warn "catan-coach no es un repo git"
fi

# GeneticAgent API
if [ -d "$ADVISOR_DIR" ] && git -C "$ADVISOR_DIR" rev-parse --is-inside-work-tree &>/dev/null; then
  # Limpiar archivos generados (pyc, pycache) que pueden causar conflictos
  git -C "$ADVISOR_DIR" clean -fd --quiet 2>/dev/null || true
  git -C "$ADVISOR_DIR" checkout -- . 2>/dev/null || true
  git -C "$ADVISOR_DIR" pull --rebase origin main 2>&1 | tail -1 | sed 's/^/  /'
  ok "catan-advisor-api sincronizado"
else
  warn "catan-advisor-api no encontrado — omitido"
fi

echo ""
log "Limpiando puertos..."
# ChromaDB corre en Docker — no matar, solo los procesos nativos
kill_port "$ADVISOR_PORT"
kill_port "$FRONTEND_PORT"
ok "Puertos libres — arrancando desde cero"
echo ""

# ── 1. ChromaDB ───────────────────────────────────────────────────────────────
log "1/3  ChromaDB (:$CHROMA_PORT)"
CHROMA_CONTAINER="catan-chroma"

chroma_running() {
  # Puerto accesible (Docker o nativo)
  curl -s --max-time 2 "http://localhost:$CHROMA_PORT/api/v1/heartbeat" > /dev/null 2>&1
}

if chroma_running; then
  ok "Ya responde en :$CHROMA_PORT — omitido"
else
  # ¿Existe el contenedor Docker?
  if docker inspect "$CHROMA_CONTAINER" &>/dev/null 2>&1; then
    docker start "$CHROMA_CONTAINER" > /dev/null
    wait_for_port "$CHROMA_PORT" "ChromaDB (Docker)"
  elif command -v chroma &>/dev/null; then
    # Fallback: CLI nativa
    mkdir -p "$CHROMA_PATH"
    nohup chroma run \
      --path "$CHROMA_PATH" \
      --port "$CHROMA_PORT" \
      > "$LOG_DIR/chroma.log" 2>&1 &
    wait_for_port "$CHROMA_PORT" "ChromaDB"
  else
    err "ChromaDB no encontrado. Levántalo manualmente:"
    err "  docker start $CHROMA_CONTAINER"
    err "  o: pip install chromadb && chroma run --path ~/.chroma/catan-chroma"
    exit 1
  fi
fi

# ── 2. GeneticAgent (FastAPI) ─────────────────────────────────────────────────
log "2/3  GeneticAgent API (:$ADVISOR_PORT)"
if port_in_use "$ADVISOR_PORT"; then
  ok "Ya está corriendo en :$ADVISOR_PORT — omitido"
else
  if [ ! -d "$ADVISOR_DIR" ]; then
    warn "No encontré $ADVISOR_DIR"
    warn "Clona el repo primero:"
    warn "  cd $(dirname "$SCRIPT_DIR") && git clone git@github.com:vjrivmon/catan-advisor-api.git"
    warn "Continuando sin GeneticAgent (el coach funciona, pero sin recomendaciones genéticas)"
  else
    # Activar venv
    if [ ! -f "$ADVISOR_DIR/.venv/bin/activate" ]; then
      log "Creando venv para GeneticAgent..."
      python3 -m venv "$ADVISOR_DIR/.venv"
      source "$ADVISOR_DIR/.venv/bin/activate"
      pip install -q -r "$ADVISOR_DIR/requirements.txt"
    else
      source "$ADVISOR_DIR/.venv/bin/activate"
    fi

    nohup uvicorn main:app \
      --app-dir "$ADVISOR_DIR" \
      --port "$ADVISOR_PORT" \
      --host 127.0.0.1 \
      > "$LOG_DIR/advisor.log" 2>&1 &
    wait_for_port "$ADVISOR_PORT" "GeneticAgent"
    deactivate 2>/dev/null || true
  fi
fi

# ── 3. Next.js frontend ───────────────────────────────────────────────────────
log "3/3  Next.js (:$FRONTEND_PORT)"
if port_in_use "$FRONTEND_PORT"; then
  ok "Ya está corriendo en :$FRONTEND_PORT — omitido"
else
  if [ ! -f "$FRONTEND_DIR/package.json" ]; then
    err "No encontré package.json en $FRONTEND_DIR"
    exit 1
  fi

  # Instalar deps si falta node_modules
  if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    log "Instalando dependencias npm..."
    (cd "$FRONTEND_DIR" && npm install --silent)
  fi

  nohup bash -c "cd '$FRONTEND_DIR' && npm run dev" \
    > "$LOG_DIR/nextjs.log" 2>&1 &
  wait_for_port "$FRONTEND_PORT" "Next.js" 60
fi

# ─────────────────────────────────────────────────────────────────────────────
# RESUMEN
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}Todo listo:${NC}"
echo -e "  ${CYAN}http://localhost:$FRONTEND_PORT${NC}  ← App principal"
echo -e "  ${CYAN}http://localhost:$ADVISOR_PORT/docs${NC}  ← GeneticAgent API"
echo -e "  ${CYAN}http://localhost:$CHROMA_PORT${NC}  ← ChromaDB"
echo ""
echo -e "  Logs:  ${YELLOW}$LOG_DIR/${NC}"
echo -e "  Stop:  ${YELLOW}./start-all.sh --stop${NC}"
echo ""
