-- Domínio proativo F14.0/F14.1. Sem backfill e sem ativar gatilho em tenant existente.

CREATE TYPE "proactive_trigger_type" AS ENUM (
  'REVENUE_GOAL_PERCENTAGE',
  'EXPENSE_CEILING_PERCENTAGE',
  'EXPENSE_CEILING_EXCEEDED',
  'TITLE_DUE_SOON'
);

CREATE TYPE "proactive_title_kind" AS ENUM ('RECEIVABLE', 'PAYABLE');

CREATE TYPE "proactive_severity" AS ENUM ('INFORMATIVE', 'ATTENTION', 'IMPORTANT', 'CRITICAL');

CREATE TYPE "analytical_event_status" AS ENUM ('DETECTED');

CREATE TYPE "ai_insight_narration_status" AS ENUM (
  'AWAITING_NARRATION',
  'NARRATED',
  'NARRATION_FAILED'
);

ALTER TYPE "ai_run_type" ADD VALUE 'PROACTIVE_NARRATION';

CREATE TABLE "proactive_trigger_configurations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "trigger_type" "proactive_trigger_type" NOT NULL,
  "parameter_key" TEXT NOT NULL,
  "percentage" INTEGER,
  "days_ahead" INTEGER,
  "minimum_amount" DECIMAL(19,4),
  "title_kind" "proactive_title_kind",
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "proactive_trigger_configurations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_proactive_trigger_configurations_identity"
  ON "proactive_trigger_configurations"("tenant_id", "trigger_type", "parameter_key");

CREATE INDEX "idx_proactive_trigger_configurations_tenant_active"
  ON "proactive_trigger_configurations"("tenant_id", "active");

ALTER TABLE "proactive_trigger_configurations"
  ADD CONSTRAINT "proactive_trigger_configurations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "analytical_events" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "trigger_configuration_id" UUID NOT NULL,
  "event_type" "proactive_trigger_type" NOT NULL,
  "parameter_key" TEXT NOT NULL,
  "period_key" TEXT NOT NULL,
  "subject_key" TEXT NOT NULL DEFAULT '',
  "occurrence_key" TEXT NOT NULL,
  "severity" "proactive_severity",
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "source_metric" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "detected_at" TIMESTAMPTZ(3) NOT NULL,
  "processed_at" TIMESTAMPTZ(3),
  "status" "analytical_event_status" NOT NULL DEFAULT 'DETECTED',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "analytical_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_analytical_events_occurrence"
  ON "analytical_events"("tenant_id", "occurrence_key");

CREATE INDEX "idx_analytical_events_tenant_detected_at"
  ON "analytical_events"("tenant_id", "detected_at");

CREATE INDEX "idx_analytical_events_configuration_id"
  ON "analytical_events"("trigger_configuration_id");

ALTER TABLE "analytical_events"
  ADD CONSTRAINT "analytical_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "analytical_events"
  ADD CONSTRAINT "analytical_events_trigger_configuration_id_fkey"
  FOREIGN KEY ("trigger_configuration_id") REFERENCES "proactive_trigger_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ai_insights" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "analytical_event_id" UUID NOT NULL,
  "insight_type" "proactive_trigger_type" NOT NULL,
  "category" TEXT,
  "title" TEXT,
  "content" TEXT,
  "severity" "proactive_severity",
  "source" TEXT NOT NULL DEFAULT 'RULE',
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "supporting_data" JSONB NOT NULL,
  "narration_status" "ai_insight_narration_status" NOT NULL DEFAULT 'AWAITING_NARRATION',
  "detected_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_insights_analytical_event_id_key" ON "ai_insights"("analytical_event_id");

CREATE INDEX "idx_ai_insights_tenant_narration_status"
  ON "ai_insights"("tenant_id", "narration_status");

CREATE INDEX "idx_ai_insights_tenant_detected_at"
  ON "ai_insights"("tenant_id", "detected_at");

ALTER TABLE "ai_insights"
  ADD CONSTRAINT "ai_insights_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_insights"
  ADD CONSTRAINT "ai_insights_analytical_event_id_fkey"
  FOREIGN KEY ("analytical_event_id") REFERENCES "analytical_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ai_insight_reads" (
  "id" UUID NOT NULL,
  "insight_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "read_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "ai_insight_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_ai_insight_reads_insight_user"
  ON "ai_insight_reads"("insight_id", "user_id");

CREATE INDEX "idx_ai_insight_reads_tenant_user"
  ON "ai_insight_reads"("tenant_id", "user_id");

ALTER TABLE "ai_insight_reads"
  ADD CONSTRAINT "ai_insight_reads_insight_id_fkey"
  FOREIGN KEY ("insight_id") REFERENCES "ai_insights"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_insight_reads"
  ADD CONSTRAINT "ai_insight_reads_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_insight_reads"
  ADD CONSTRAINT "ai_insight_reads_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_messages" ADD COLUMN "related_insight_id" UUID;

CREATE INDEX "idx_ai_messages_related_insight_id" ON "ai_messages"("related_insight_id");

ALTER TABLE "ai_messages"
  ADD CONSTRAINT "ai_messages_related_insight_id_fkey"
  FOREIGN KEY ("related_insight_id") REFERENCES "ai_insights"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_runs" ADD COLUMN "insight_id" UUID;

CREATE INDEX "idx_ai_runs_insight_id" ON "ai_runs"("insight_id");

ALTER TABLE "ai_runs"
  ADD CONSTRAINT "ai_runs_insight_id_fkey"
  FOREIGN KEY ("insight_id") REFERENCES "ai_insights"("id") ON DELETE SET NULL ON UPDATE CASCADE;
