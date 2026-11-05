-- Meta de faturamento e teto de gastos por centro de custo.
-- cost_center_id NULL = valor geral da empresa (linhas existentes continuam gerais, sem backfill).
-- A unique (tenant, mês) vira dois índices únicos parciais: Postgres trata NULLs como distintos,
-- então uma unique (tenant, mês, centro) aceitaria duas metas gerais no mesmo mês.
--
-- Rollback de emergência (APAGA metas/tetos por centro; os gerais ficam intactos):
-- DELETE FROM "revenue_goals" WHERE "cost_center_id" IS NOT NULL;
-- DROP INDEX IF EXISTS "uq_revenue_goals_tenant_month_cost_center";
-- DROP INDEX IF EXISTS "uq_revenue_goals_tenant_month_company";
-- ALTER TABLE "revenue_goals" DROP CONSTRAINT IF EXISTS "revenue_goals_cost_center_id_fkey";
-- ALTER TABLE "revenue_goals" DROP COLUMN IF EXISTS "cost_center_id";
-- CREATE UNIQUE INDEX "uq_revenue_goals_tenant_month" ON "revenue_goals"("tenant_id", "month_key");
-- DELETE FROM "expense_ceilings" WHERE "cost_center_id" IS NOT NULL;
-- DROP INDEX IF EXISTS "uq_expense_ceilings_tenant_month_cost_center";
-- DROP INDEX IF EXISTS "uq_expense_ceilings_tenant_month_company";
-- ALTER TABLE "expense_ceilings" DROP CONSTRAINT IF EXISTS "expense_ceilings_cost_center_id_fkey";
-- ALTER TABLE "expense_ceilings" DROP COLUMN IF EXISTS "cost_center_id";
-- CREATE UNIQUE INDEX "uq_expense_ceilings_tenant_month" ON "expense_ceilings"("tenant_id", "month_key");
-- DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261105120000_goals_by_cost_center';

ALTER TABLE "revenue_goals" ADD COLUMN "cost_center_id" UUID;
ALTER TABLE "revenue_goals" ADD CONSTRAINT "revenue_goals_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "uq_revenue_goals_tenant_month";
CREATE UNIQUE INDEX "uq_revenue_goals_tenant_month_company" ON "revenue_goals"("tenant_id", "month_key") WHERE "cost_center_id" IS NULL;
CREATE UNIQUE INDEX "uq_revenue_goals_tenant_month_cost_center" ON "revenue_goals"("tenant_id", "month_key", "cost_center_id") WHERE "cost_center_id" IS NOT NULL;

ALTER TABLE "expense_ceilings" ADD COLUMN "cost_center_id" UUID;
ALTER TABLE "expense_ceilings" ADD CONSTRAINT "expense_ceilings_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "uq_expense_ceilings_tenant_month";
CREATE UNIQUE INDEX "uq_expense_ceilings_tenant_month_company" ON "expense_ceilings"("tenant_id", "month_key") WHERE "cost_center_id" IS NULL;
CREATE UNIQUE INDEX "uq_expense_ceilings_tenant_month_cost_center" ON "expense_ceilings"("tenant_id", "month_key", "cost_center_id") WHERE "cost_center_id" IS NOT NULL;
