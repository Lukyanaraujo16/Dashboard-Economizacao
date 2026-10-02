-- Rastreia quais insights uma mensagem proativa apresentou.
-- Não altera fatos, deduplicação nem leitura.

CREATE TABLE "ai_message_insight_links" (
    "message_id" UUID NOT NULL,
    "insight_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_message_insight_links_pkey" PRIMARY KEY ("message_id", "insight_id")
);

CREATE INDEX "idx_ai_message_insight_links_insight_id"
ON "ai_message_insight_links"("insight_id");

CREATE INDEX "idx_ai_message_insight_links_tenant_id"
ON "ai_message_insight_links"("tenant_id");

ALTER TABLE "ai_message_insight_links"
ADD CONSTRAINT "ai_message_insight_links_message_id_fkey"
FOREIGN KEY ("message_id") REFERENCES "ai_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_message_insight_links"
ADD CONSTRAINT "ai_message_insight_links_insight_id_fkey"
FOREIGN KEY ("insight_id") REFERENCES "ai_insights"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_message_insight_links"
ADD CONSTRAINT "ai_message_insight_links_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
