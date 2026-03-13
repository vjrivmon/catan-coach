import type { NextConfig } from "next";

// Bypass SSL verification for self-signed certs (e.g. UPV Ollama server)
if (process.env.OLLAMA_INSECURE === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
