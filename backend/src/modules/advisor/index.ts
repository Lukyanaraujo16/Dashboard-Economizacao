export * from './domain/index.js';
export * from './repositories/index.js';
export * from './services/index.js';
export { registerAdminConsultantRoutes, registerConsultantRoutes } from './http/index.js';
export type {
  PublicAdminConsultantSettings,
  PublicConsultantOptions,
  PublicKnowledgeEntry,
} from './http/index.js';
