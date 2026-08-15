import type { NextConfig } from 'next';

/**
 * Proxy same-origin: browser → Next → Fastify.
 * Em produção com reverse proxy externo para `/auth`, este rewrite permanece
 * inofensivo se o gateway já encaminhar `/auth` ao backend.
 */
const backendOrigin = (process.env.API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');

const nextConfig: NextConfig = {
  // Permite HMR/WebSocket do Next DEV quando o browser acessa via IP da LAN.
  allowedDevOrigins: ['192.168.1.91'],
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
    ];
  },
};

export default nextConfig;
