import type { PrismaClient } from '../../../generated/prisma/client.js';
import { AdvisorDomainError } from '../domain/advisor-domain-error.js';
import { proactiveTriggerDefaultPackage, PROACTIVE_TRIGGER_DEFAULT_PACKAGE_VERSION } from '../domain/proactive-trigger-default-package.js';
import { logProactive } from '../domain/schedule-proactive-evaluation.js';
import type { ProactiveTriggerRepository } from '../repositories/proactive-trigger.repository.js';

export type ProactiveTriggerBootstrapResult = {
  readonly created: number;
  readonly preserved: number;
  readonly alreadyBootstrapped: boolean;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

export function createProactiveTriggerBootstrap(deps: {
  readonly prisma: PrismaClient;
  readonly triggers: ProactiveTriggerRepository;
}) {
  return {
    async ensureDefaultPackage(tenantId: string): Promise<ProactiveTriggerBootstrapResult> {
      const started = Date.now();
      const marker = await deps.prisma.proactiveTriggerBootstrap.findUnique({
        where: { tenantId },
      });
      if (marker && marker.packageVersion >= PROACTIVE_TRIGGER_DEFAULT_PACKAGE_VERSION) {
        logProactive('proactive_bootstrap', {
          tenantId,
          packageVersion: marker.packageVersion,
          created: 0,
          preserved: 0,
          alreadyBootstrapped: true,
          durationMs: Date.now() - started,
          success: true,
        });
        return { created: 0, preserved: 0, alreadyBootstrapped: true };
      }

      let created = 0;
      let preserved = 0;
      for (const parsed of proactiveTriggerDefaultPackage()) {
        const existing = await deps.prisma.proactiveTriggerConfiguration.findFirst({
          where: {
            tenantId,
            triggerType: parsed.triggerType,
            parameterKey: parsed.parameterKey,
          },
          select: { id: true },
        });
        if (existing) {
          preserved += 1;
          continue;
        }
        try {
          await deps.triggers.create(tenantId, parsed);
          created += 1;
        } catch (error) {
          if (
            error instanceof AdvisorDomainError &&
            error.code === 'TRIGGER_CONFIGURATION_DUPLICATE'
          ) {
            preserved += 1;
            continue;
          }
          logProactive('proactive_bootstrap', {
            tenantId,
            packageVersion: PROACTIVE_TRIGGER_DEFAULT_PACKAGE_VERSION,
            created,
            preserved,
            alreadyBootstrapped: false,
            durationMs: Date.now() - started,
            success: false,
          });
          throw error;
        }
      }

      try {
        await deps.prisma.proactiveTriggerBootstrap.create({
          data: {
            tenantId,
            packageVersion: PROACTIVE_TRIGGER_DEFAULT_PACKAGE_VERSION,
            createdCount: created,
            preservedCount: preserved,
          },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
      }

      logProactive('proactive_bootstrap', {
        tenantId,
        packageVersion: PROACTIVE_TRIGGER_DEFAULT_PACKAGE_VERSION,
        created,
        preserved,
        alreadyBootstrapped: false,
        durationMs: Date.now() - started,
        success: true,
      });
      return { created, preserved, alreadyBootstrapped: false };
    },
  };
}
