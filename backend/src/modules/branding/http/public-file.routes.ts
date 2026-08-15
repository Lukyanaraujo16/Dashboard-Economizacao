import type { FastifyInstance } from 'fastify';

import { loadEnvironment } from '../../../config/env.js';
import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { createFileStorage } from '../../../infrastructure/storage/index.js';
import { ValidationError } from '../../../shared/errors/application-error.js';
import { createPublicFileService } from '../services/admin-branding.service.js';
import { createStoredFileRepository } from '../repositories/stored-file.repository.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseFileIdParam(params: unknown): string {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new ValidationError('Parâmetro de rota inválido.', {
      details: [{ field: 'fileId', issue: 'required' }],
    });
  }

  const fileId = (params as Record<string, unknown>).fileId;
  if (typeof fileId !== 'string' || !UUID_PATTERN.test(fileId)) {
    throw new ValidationError('Identificador de arquivo inválido.', {
      details: [{ field: 'fileId', issue: 'invalid_uuid' }],
    });
  }

  return fileId;
}

/**
 * Leitura pública opaca de arquivos de branding (logo). Mutação permanece autenticada.
 */
export async function registerPublicFileRoutes(app: FastifyInstance): Promise<void> {
  const environment = loadEnvironment();
  const prisma = getPrismaClient();
  const files = createStoredFileRepository(prisma);
  const storage = createFileStorage(environment);
  const publicFiles = createPublicFileService({ files, storage });

  app.get('/files/:fileId', async (request, reply) => {
    const fileId = parseFileIdParam(request.params);
    const file = await publicFiles.getById(fileId);

    return reply
      .status(200)
      .header('Content-Type', file.mimeType)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'public, max-age=3600')
      .send(file.body);
  });
}
