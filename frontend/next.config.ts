import type { NextConfig } from 'next';

/**
 * Proxy same-origin: browser → Next → Fastify.
 * Em produção com reverse proxy externo para `/auth`, este rewrite permanece
 * inofensivo se o gateway já encaminhar `/auth` ao backend.
 */
const backendOrigin = (process.env.API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');

const nextConfig: NextConfig = {
  // Next 16 bloqueia origens DEV diferentes do hostname de bind (`localhost`).
  // `127.0.0.1` é o host local do callback OAuth. `*.trycloudflare.com` cobre
  // Quick Tunnels sem hardcodar o hostname temporário. LAN permanece explícita.
  allowedDevOrigins: ['127.0.0.1', '192.168.1.91', '*.trycloudflare.com'],
  async rewrites() {
    return [
      {
        source: '/auth/:path*',
        destination: `${backendOrigin}/auth/:path*`,
      },
      {
        source: '/admin/:path*',
        destination: `${backendOrigin}/admin/:path*`,
      },
      {
        source: '/files/:path*',
        destination: `${backendOrigin}/files/:path*`,
      },
      {
        source: '/branding/:path*',
        destination: `${backendOrigin}/branding/:path*`,
      },
      {
        source: '/integrations/:path*',
        destination: `${backendOrigin}/integrations/:path*`,
      },
    ];
  },
};

export default nextConfig;
