module.exports = {
  apps: [
    {
      name: 'catan-coach',
      cwd: '/home/gti/catan-coach',
      script: 'node_modules/.bin/next',
      args: 'start --port 3000',
      env: {
        NODE_ENV: 'production',
        OLLAMA_BASE_URL: 'https://ollama.gti-ia.upv.es',
        OLLAMA_INSECURE: 'true',
        MAIN_MODEL: 'gemma3:27b',
        SUGGESTION_MODEL: 'qwen3:8b',
        EMBEDDING_MODEL: 'nomic-embed-text:latest',
        CHROMA_URL: 'http://localhost:8000',
      },
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/home/gti/catan-coach/logs/pm2-error.log',
      out_file: '/home/gti/catan-coach/logs/pm2-out.log',
    },
    {
      name: 'catan-webhook',
      cwd: '/home/gti/catan-coach',
      script: 'webhook-server.cjs',
      env: {
        WEBHOOK_SECRET: 'CAMBIAR_POR_SECRET_ALEATORIO',
      },
      max_memory_restart: '64M',
      error_file: '/home/gti/catan-coach/logs/webhook-error.log',
      out_file: '/home/gti/catan-coach/logs/webhook-out.log',
    },
  ],
};
