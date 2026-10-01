-- Teto mensal de gastos gerencial por tenant. Sem backfill.

CREATE TABLE "expense_ceilings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "month_key" VARCHAR(7) NOT NULL,
    "ceiling_amount" DECIMAL(19,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "expense_ceilings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_expense_ceilings_tenant_month" ON "expense_ceilings"("tenant_id", "month_key");

CREATE INDEX "idx_expense_ceilings_tenant_month" ON "expense_ceilings"("tenant_id", "month_key");

ALTER TABLE "expense_ceilings" ADD CONSTRAINT "expense_ceilings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
