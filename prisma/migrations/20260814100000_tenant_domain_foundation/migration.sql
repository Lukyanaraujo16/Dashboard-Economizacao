-- Backfill deactivated_at for existing DISABLED tenants before adding the constraint.
UPDATE "tenants"
SET "deactivated_at" = COALESCE("deactivated_at", "updated_at", CURRENT_TIMESTAMP)
WHERE "status" = 'DISABLED' AND "deactivated_at" IS NULL;

-- Clear deactivated_at for ACTIVE tenants.
UPDATE "tenants"
SET "deactivated_at" = NULL
WHERE "status" = 'ACTIVE' AND "deactivated_at" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "uq_tenants_name" ON "tenants"("name");

-- Enforce status ↔ deactivated_at consistency (docs/13 §6.1, TENANT-003).
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_status_deactivated_at_chk" CHECK (
  ("status" = 'ACTIVE' AND "deactivated_at" IS NULL)
  OR ("status" = 'DISABLED' AND "deactivated_at" IS NOT NULL)
);
