import type { NextConfig } from 'next';

/**
 * Proxy same-origin: browser → Next → Fastify.
 * Em produção com reverse proxy externo para `/auth`, este rewrite permanece
 * inofensivo se o gateway já encaminhar `/auth` ao backend.
 */
const backendOrigin = (process.env.API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/auth/:path*',
        destination: `${backendOrigin}/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
