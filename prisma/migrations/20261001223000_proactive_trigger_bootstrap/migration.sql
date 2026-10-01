-- Marcador explícito do pacote padrão de gatilhos.
-- Não faz backfill e não cria configuração.

CREATE TABLE "proactive_trigger_bootstraps" (
    "tenant_id" UUID NOT NULL,
    "package_version" INTEGER NOT NULL,
    "created_count" INTEGER NOT NULL,
    "preserved_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proactive_trigger_bootstraps_pkey" PRIMARY KEY ("tenant_id")
);

ALTER TABLE "proactive_trigger_bootstraps"
ADD CONSTRAINT "proactive_trigger_bootstraps_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
