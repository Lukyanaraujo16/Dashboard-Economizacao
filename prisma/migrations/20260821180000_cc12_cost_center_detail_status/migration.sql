-- CC1.2: estado idempotente de enriquecimento de centro de custo por parcela.
-- Distingue UNKNOWN (nunca tentou) de NO_ALLOCATION (confirmado sem rateio).

CREATE TYPE "cost_center_detail_status" AS ENUM (
  'UNKNOWN',
  'FETCHED',
  'NO_ALLOCATION',
  'UNRESOLVED',
  'ERROR'
);

ALTER TABLE "receivables"
  ADD COLUMN "cost_center_detail_status" "cost_center_detail_status" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "cost_center_detail_synced_at" TIMESTAMPTZ(3),
  ADD COLUMN "cost_center_detail_rule_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "payables"
  ADD COLUMN "cost_center_detail_status" "cost_center_detail_status" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "cost_center_detail_synced_at" TIMESTAMPTZ(3),
  ADD COLUMN "cost_center_detail_rule_version" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "idx_receivables_tenant_cc_detail_status"
  ON "receivables"("tenant_id", "cost_center_detail_status");

CREATE INDEX "idx_payables_tenant_cc_detail_status"
  ON "payables"("tenant_id", "cost_center_detail_status");

-- Backfill: parcelas que já têm allocation foram enriquecidas (FETCHED).
-- Regra version = 1 (CC1.1 normalize já aplicada no runtime/backfill).
UPDATE "receivables" AS r
SET
  "cost_center_detail_status" = 'FETCHED',
  "cost_center_detail_synced_at" = sub.max_synced,
  "cost_center_detail_rule_version" = 1
FROM (
  SELECT "receivable_id" AS id, MAX("synced_at") AS max_synced
  FROM "installment_cost_center_allocations"
  WHERE "receivable_id" IS NOT NULL
  GROUP BY "receivable_id"
) AS sub
WHERE r."id" = sub.id;

UPDATE "payables" AS p
SET
  "cost_center_detail_status" = 'FETCHED',
  "cost_center_detail_synced_at" = sub.max_synced,
  "cost_center_detail_rule_version" = 1
FROM (
  SELECT "payable_id" AS id, MAX("synced_at") AS max_synced
  FROM "installment_cost_center_allocations"
  WHERE "payable_id" IS NOT NULL
  GROUP BY "payable_id"
) AS sub
WHERE p."id" = sub.id;
