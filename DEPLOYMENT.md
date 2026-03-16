# Despliegue de catan-coach en ireves.gti-ia.dsic.upv.es

## Arquitectura

```
Usuario → Apache2 (:80) → ProxyPass → Next.js (:3000, Docker)
                                          ├── ChromaDB (:8000, Docker)
                                          └── Ollama (remoto: ollama.gti-ia.upv.es)

Webhook: GitHub → Apache /webhook → webhook-server (:9000, Docker)
```

### Servicios

| Servicio | Puerto | Gestión | Notas |
|----------|--------|---------|-------|
| Next.js (catan-coach) | 3000 | Docker Compose | App principal |
| Webhook server | 9000 | Docker Compose | Auto-deploy desde GitHub |
| ChromaDB | 8000 | Docker Compose | Base de datos vectorial |
| Apache2 | 80 | systemd | Reverse proxy |
| Ollama | remoto | — | `ollama.gti-ia.upv.es` |

### Rutas de ficheros

- **Proyecto**: `/home/gti/catan-coach/`
- **Apache config**: `/etc/apache2/sites-available/catan-coach.conf`
- **Backup Apache original**: `~/apache2-backup-YYYYMMDD/`
- **Backup HTML original**: `~/html-backup-YYYYMMDD/`

---

## Variables de entorno

Definidas en `docker-compose.yml`:

| Variable | Valor |
|----------|-------|
| `OLLAMA_BASE_URL` | `https://ollama.gti-ia.upv.es` |
| `OLLAMA_INSECURE` | `true` |
| `MAIN_MODEL` | `gemma3:27b` |
| `SUGGESTION_MODEL` | `qwen3:8b` |
| `EMBEDDING_MODEL` | `nomic-embed-text:latest` |
| `CHROMA_URL` | `http://chromadb:8000` |
| `WEBHOOK_SECRET` | (configurado en docker-compose.yml) |

---

## Operaciones comunes

### Ver estado de los servicios
```bash
cd ~/catan-coach
docker compose ps
```

### Ver logs
```bash
docker compose logs app --tail 50
docker compose logs webhook --tail 20
docker compose logs chromadb --tail 20
cat /home/gti/catan-coach/logs/deploy.log
sudo tail -f /var/log/apache2/catan-coach-error.log
```

### Reiniciar la app
```bash
cd ~/catan-coach
docker compose restart app
```

### Rebuild manual
```bash
cd ~/catan-coach
git pull origin master
docker compose up -d --build app
```

### Re-ingestar datos de conocimiento
```bash
curl -X POST http://localhost:3000/api/ingest
```

### Reiniciar ChromaDB
```bash
docker compose restart chromadb
```

### Parar todo
```bash
cd ~/catan-coach
docker compose down
```

---

## Restaurar ireves-map (estado anterior)

Si es necesario volver al estado previo a catan-coach:

```bash
# 1. Parar catan-coach
cd ~/catan-coach
docker compose down

# 2. Reactivar el site original de Apache
sudo a2dissite catan-coach.conf
sudo a2ensite 000-default.conf
sudo systemctl reload apache2

# 3. (Opcional) Relanzar Flask server de ireves-map
cd ~/ireves-map-server && . venv/bin/activate
export FLASK_ENV=development && flask run --host=0.0.0.0

# 4. (Opcional) Relanzar openrouteservice
docker start 3998e8a24619
```

Para volver a activar catan-coach después:
```bash
sudo a2dissite 000-default.conf
sudo a2ensite catan-coach.conf
sudo systemctl reload apache2
cd ~/catan-coach && docker compose up -d
```

---

## Configuración del Webhook (auto-deploy)

- **URL en GitHub**: `http://ireves.gti-ia.dsic.upv.es/webhook`
- **Content type**: `application/json`
- **Secret**: debe coincidir con `WEBHOOK_SECRET` en `docker-compose.yml`
- **Events**: solo `push`
- **Rama**: solo deploys en `master`

El webhook listener corre en Docker (`catan-webhook`) en puerto 9000, ruteado a través de Apache en `/webhook`.

---

## Troubleshooting

### La app no responde
```bash
docker compose ps                     # ¿está running?
docker compose logs app --tail 30     # errores recientes
curl http://localhost:3000            # responde localmente?
sudo apache2ctl configtest            # config Apache OK?
```

### ChromaDB no responde
```bash
docker compose logs chromadb --tail 20               # errores
curl http://localhost:8000/api/v1/heartbeat           # heartbeat
```

### El chat no genera respuestas (Ollama)
```bash
curl https://ollama.gti-ia.upv.es/api/tags   # ¿Ollama accesible?
```

### Deploy automático no funciona
```bash
docker compose logs webhook --tail 20   # errores del webhook
cat logs/deploy.log                     # historial de deploys
```

### Puerto ocupado
```bash
ss -tlnp | grep :3000
ss -tlnp | grep :8000
ss -tlnp | grep :9000
```
