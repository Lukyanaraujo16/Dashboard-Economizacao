declare module 'fastify' {
  interface Session {
    /** Marcador exclusivo de rotas de teste (1.1B). Não usar em produto. */
    testMarker?: string;
  }
}

export {};
