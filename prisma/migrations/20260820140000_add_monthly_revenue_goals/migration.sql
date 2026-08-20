-- F2: Meta mensal de faturamento gerencial por tenant.

CREATE TABLE "revenue_goals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "month_key" VARCHAR(7) NOT NULL,
    "target_amount" DECIMAL(19,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "revenue_goals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_revenue_goals_tenant_month" ON "revenue_goals"("tenant_id", "month_key");

CREATE INDEX "idx_revenue_goals_tenant_month" ON "revenue_goals"("tenant_id", "month_key");

ALTER TABLE "revenue_goals" ADD CONSTRAINT "revenue_goals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
