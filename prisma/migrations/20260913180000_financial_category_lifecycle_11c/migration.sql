-- Correção 11-C: lifecycle de categorias financeiras (presença/ausência no snapshot).
-- Categorias existentes permanecem active=true (DEFAULT). Sem hard-delete.

ALTER TABLE "financial_categories" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "idx_financial_categories_tenant_active" ON "financial_categories"("tenant_id", "active");
