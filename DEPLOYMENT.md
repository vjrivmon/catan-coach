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
| ChromaDB | 8000 | Docker Compose | Base de datos vectorial RAG |
| Apache2 | 80 | systemd | Reverse proxy |
| Ollama | remoto | — | `https://ollama.gti-ia.upv.es` |

### Rutas en el servidor

| Ruta | Descripción |
|------|-------------|
| `/home/gti/catan-coach/` | Directorio del proyecto |
| `/home/gti/catan-coach/logs/deploy.log` | Log de deploys |
| `/etc/apache2/sites-available/catan-coach.conf` | Config Apache |

---

## Requisitos previos en el servidor

- **Docker** >= 24 y **Docker Compose** (plugin integrado)
- **git** configurado con acceso al repo
- **Apache2** instalado y corriendo como reverse proxy
- Puerto 80 público, 3000/8000/9000 solo en localhost (ya configurado en `docker-compose.yml`)

Verificar antes de desplegar:
```bash
docker --version
docker compose version
git --version
sudo apache2ctl configtest
```

---

## Primer despliegue (paso a paso)

### 1. Conectar al servidor

```bash
ssh gti@ireves.gti-ia.dsic.upv.es
```

### 2. Clonar el repositorio

```bash
cd ~
git clone https://github.com/vjrivmon/catan-chatbot.git catan-coach
cd catan-coach
```

### 3. Ajustar el WEBHOOK_SECRET

El archivo `docker-compose.yml` tiene `WEBHOOK_SECRET=CAMBIAR_POR_SECRET_ALEATORIO`.  
**Antes de levantar los contenedores**, edítalo con un valor real:

```bash
# Generar un secreto aleatorio
openssl rand -hex 32

# Editar el compose
nano docker-compose.yml
# Cambiar: WEBHOOK_SECRET=<pegar_el_secreto_generado>
```

Guarda ese mismo secreto en la configuración del webhook de GitHub (ver sección más abajo).

### 4. Ejecutar el despliegue inicial

```bash
bash deploy-fresh.sh
```

El script hace automáticamente:
1. `git pull origin master`
2. `docker compose down && docker compose up -d --build`
3. Health check en `localhost:3000` (espera hasta 60s)
4. **Ingesta de embeddings** (`/api/ingest`, hasta 5 min) → obligatoria la primera vez
5. Verificación de colecciones en ChromaDB
6. Resumen final con `docker compose ps`

> **¿Por qué la ingesta es obligatoria?**  
> ChromaDB arranca completamente vacío. Sin embeddings, el sistema RAG no puede recuperar
> contexto de reglas ni estrategia, por lo que el chatbot responde sin conocimiento del
> reglamento. La ingesta procesa los ficheros de `knowledge/rules/` y `knowledge/strategy/`,
> genera embeddings con `nomic-embed-text` vía Ollama, y los almacena en ChromaDB.  
> El volumen Docker `chroma-data` persiste los datos: **las siguientes actualizaciones no
> necesitan re-ingestar** salvo que cambies el contenido de `knowledge/`.

### 5. Configurar Apache como reverse proxy

```bash
sudo nano /etc/apache2/sites-available/catan-coach.conf
```

Contenido mínimo:
```apache
<VirtualHost *:80>
    ServerName ireves.gti-ia.dsic.upv.es

    ProxyPreserveHost On
    ProxyPass /webhook http://localhost:9000/
    ProxyPassReverse /webhook http://localhost:9000/

    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/

    ErrorLog ${APACHE_LOG_DIR}/catan-coach-error.log
    CustomLog ${APACHE_LOG_DIR}/catan-coach-access.log combined
</VirtualHost>
```

```bash
sudo a2enmod proxy proxy_http
sudo a2ensite catan-coach.conf
sudo a2dissite 000-default.conf   # si era el default activo
sudo apache2ctl configtest
sudo systemctl reload apache2
```

### 6. Verificar acceso público

```bash
curl http://ireves.gti-ia.dsic.upv.es
# Debe devolver el HTML de Next.js
```

---

## Flujo de actualización

Cuando hay cambios en el código (sin cambios en `knowledge/`):

```bash
ssh gti@ireves.gti-ia.dsic.upv.es
cd ~/catan-coach
git pull origin master
docker compose up -d --build app
```

Si los cambios afectan a `knowledge/` (reglas o estrategia), re-ingestar:

```bash
docker compose up -d --build app
curl -X POST http://localhost:3000/api/ingest --max-time 300
```

---

## Webhook: auto-deploy en push a master

El contenedor `catan-webhook` escucha en el puerto 9000 y ejecuta `git pull + rebuild`
automáticamente cuando GitHub hace un push a `master`.

### Configuración en GitHub

1. Ve a **Settings → Webhooks → Add webhook** en el repo
2. **Payload URL**: `http://ireves.gti-ia.dsic.upv.es/webhook`
3. **Content type**: `application/json`
4. **Secret**: el mismo valor que `WEBHOOK_SECRET` en `docker-compose.yml`
5. **Events**: selecciona solo `push`
6. Guarda

Cada commit a `master` disparará el webhook, que reconstruirá y relanzará los contenedores.
Los logs quedan en `logs/deploy.log`.

> **Nota:** el webhook NO re-ingesta automáticamente. Si el push incluye cambios en
> `knowledge/`, ejecuta manualmente `curl -X POST http://localhost:3000/api/ingest --max-time 300`.

---

## Variables de entorno

Definidas en `docker-compose.yml` (no se necesita fichero `.env`):

| Variable | Valor |
|----------|-------|
| `OLLAMA_BASE_URL` | `https://ollama.gti-ia.upv.es` |
| `OLLAMA_INSECURE` | `true` |
| `MAIN_MODEL` | `gemma3:27b` |
| `SUGGESTION_MODEL` | `qwen3:8b` |
| `EMBEDDING_MODEL` | `nomic-embed-text:latest` |
| `CHROMA_URL` | `http://chromadb:8000` |
| `WEBHOOK_SECRET` | *(cambiar antes del primer deploy)* |

---

## Operaciones comunes

### Ver estado
```bash
cd ~/catan-coach
docker compose ps
```

### Ver logs
```bash
docker compose logs app --tail 50
docker compose logs webhook --tail 20
docker compose logs chromadb --tail 20
cat ~/catan-coach/logs/deploy.log
sudo tail -f /var/log/apache2/catan-coach-error.log
```

### Reiniciar solo la app
```bash
docker compose restart app
```

### Re-ingestar datos de conocimiento
```bash
curl -X POST http://localhost:3000/api/ingest --max-time 300
```

### Parar todo
```bash
docker compose down
```

---

## Troubleshooting

### La app no responde (público)
```bash
sudo apache2ctl configtest
sudo systemctl status apache2
curl http://localhost:3000             # ¿responde internamente?
docker compose ps                      # ¿están corriendo los contenedores?
docker compose logs app --tail 30
```

### La app no responde (localhost:3000)
```bash
docker compose logs app --tail 50      # buscar errores de build o runtime
docker compose up --build app          # rebuild en foreground para ver errores
```

### ChromaDB no responde
```bash
docker compose logs chromadb --tail 20
curl http://localhost:8000/api/v1/heartbeat    # API v1
curl http://localhost:8000/api/v2/collections  # API v2
docker compose restart chromadb
```

### La ingesta falla o devuelve error
```bash
# Verificar que Ollama y ChromaDB están accesibles
curl https://ollama.gti-ia.upv.es/api/tags
curl http://localhost:8000/api/v1/heartbeat

# Re-intentar con más verbosidad
curl -v -X POST http://localhost:3000/api/ingest --max-time 300

# Ver logs de la app durante la ingesta
docker compose logs app -f
```

### El chat no genera respuestas
```bash
# Verificar Ollama remoto
curl https://ollama.gti-ia.upv.es/api/tags

# Verificar que los modelos están disponibles
# Si OLLAMA_INSECURE=true no basta, revisar certificados SSL del servidor Ollama
```

### Deploy automático (webhook) no funciona
```bash
docker compose logs webhook --tail 30
cat ~/catan-coach/logs/deploy.log

# Verificar que el WEBHOOK_SECRET coincide con GitHub
# Verificar que Apache proxy /webhook → localhost:9000 está activo
curl -X POST http://localhost:9000/ -H "X-Hub-Signature-256: test"
```

### Puerto ocupado
```bash
ss -tlnp | grep -E ':3000|:8000|:9000'
```

### Restaurar estado anterior (ireves-map)

Si es necesario volver al estado previo a catan-coach:

```bash
cd ~/catan-coach && docker compose down
sudo a2dissite catan-coach.conf
sudo a2ensite 000-default.conf
sudo systemctl reload apache2
```

Para volver a activar catan-coach:
```bash
sudo a2dissite 000-default.conf
sudo a2ensite catan-coach.conf
sudo systemctl reload apache2
cd ~/catan-coach && docker compose up -d
```
