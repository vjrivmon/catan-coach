import type { NextConfig } from "next";

// Bypass SSL verification for self-signed certs (e.g. UPV Ollama server)
if (process.env.OLLAMA_INSECURE === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ['catan-coach.loca.lt'],
  serverExternalPackages: ['chromadb', '@chroma-core/default-embed', '@chroma-core/ai-embeddings-common'],
  experimental: {
    turbo: {
      rules: {}
    }
  }
};

export default nextConfig;
