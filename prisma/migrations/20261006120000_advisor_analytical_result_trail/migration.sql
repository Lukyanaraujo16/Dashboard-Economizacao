-- Trilha de resultado analítico do Consultor.
-- Separa o status técnico de ai_runs do resultado analítico da pergunta.
-- Não copia prompt, SQL, credencial nem payload financeiro.
--
-- Rollback de emergência, se o padrão do ambiente exigir reverter só esta migration:
-- DROP TABLE IF EXISTS "ai_analytical_tool_traces";
-- DROP TABLE IF EXISTS "ai_analytical_results";
-- DROP TYPE IF EXISTS "analytical_tool_failure_reason";
-- DROP TYPE IF EXISTS "analytical_tool_trace_status";
-- DROP TYPE IF EXISTS "analytical_unresolved_dimension";
-- DROP TYPE IF EXISTS "analytical_answer_source";
-- DROP TYPE IF EXISTS "analytical_outcome";

CREATE TYPE "analytical_outcome" AS ENUM (
  'ANSWERED',
  'PARTIAL',
  'CLARIFICATION_REQUIRED',
  'UNSUPPORTED',
  'NO_DATA',
  'TOOL_ERROR',
  'PROVIDER_ERROR'
);

CREATE TYPE "analytical_answer_source" AS ENUM (
  'BILLING',
  'BILLING_SERIES',
  'PLANNING',
  'DAILY_CASH_MOVEMENT',
  'COUNTERPARTY',
  'COST_CENTER',
  'NOMINAL',
  'COMPARISON',
  'SNAPSHOT',
  'CATEGORY_BREAKDOWN',
  'MOVEMENT_LINES',
  'CAPABILITY_DENIED',
  'PROVIDER'
);

CREATE TYPE "analytical_unresolved_dimension" AS ENUM (
  'CATEGORY',
  'COST_CENTER',
  'COUNTERPARTY'
);

CREATE TYPE "analytical_tool_trace_status" AS ENUM (
  'SUCCESS',
  'EMPTY',
  'NOT_FOUND',
  'AMBIGUOUS',
  'UNAVAILABLE'
);

CREATE TYPE "analytical_tool_failure_reason" AS ENUM (
  'UNKNOWN_TOOL',
  'INVALID_ARGUMENTS',
  'CAPABILITY_DENIED',
  'ENTITY_NOT_FOUND',
  'ENTITY_AMBIGUOUS',
  'NO_DATA',
  'TOOL_TIMEOUT',
  'TOOL_EXECUTION_ERROR',
  'UNSUPPORTED_OPERATION',
  'UNKNOWN'
);

CREATE TABLE "ai_analytical_results" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "user_message_id" UUID NOT NULL,
  "consultant_message_id" UUID,
  "run_id" UUID,
  "outcome" "analytical_outcome" NOT NULL,
  "answer_source" "analytical_answer_source" NOT NULL,
  "tool_call_count" INTEGER NOT NULL,
  "tool_round_count" INTEGER NOT NULL,
  "unresolved_dimension" "analytical_unresolved_dimension",
  "unresolved_entity" VARCHAR(80),
  "duration_ms" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_analytical_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_analytical_tool_traces" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "result_id" UUID NOT NULL,
  "round" INTEGER NOT NULL,
  "tool_name" VARCHAR(80) NOT NULL,
  "known" BOOLEAN NOT NULL,
  "status" "analytical_tool_trace_status" NOT NULL,
  "reason" "analytical_tool_failure_reason",
  "duration_ms" INTEGER,
  "result_cardinality" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_analytical_tool_traces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_ai_analytical_results_tenant_user_message"
  ON "ai_analytical_results"("tenant_id", "user_message_id");

CREATE UNIQUE INDEX "ai_analytical_results_run_id_key"
  ON "ai_analytical_results"("run_id");

CREATE INDEX "idx_ai_analytical_results_tenant_created_at"
  ON "ai_analytical_results"("tenant_id", "created_at");

CREATE INDEX "idx_ai_analytical_results_tenant_outcome_created_at"
  ON "ai_analytical_results"("tenant_id", "outcome", "created_at");

CREATE INDEX "idx_ai_analytical_results_conversation_id"
  ON "ai_analytical_results"("conversation_id");

CREATE INDEX "idx_ai_analytical_tool_traces_tenant_result"
  ON "ai_analytical_tool_traces"("tenant_id", "result_id");

ALTER TABLE "ai_analytical_results"
  ADD CONSTRAINT "ai_analytical_results_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_analytical_results"
  ADD CONSTRAINT "ai_analytical_results_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_analytical_results"
  ADD CONSTRAINT "ai_analytical_results_user_message_id_fkey"
  FOREIGN KEY ("user_message_id") REFERENCES "ai_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_analytical_results"
  ADD CONSTRAINT "ai_analytical_results_consultant_message_id_fkey"
  FOREIGN KEY ("consultant_message_id") REFERENCES "ai_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_analytical_results"
  ADD CONSTRAINT "ai_analytical_results_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "ai_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_analytical_tool_traces"
  ADD CONSTRAINT "ai_analytical_tool_traces_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_analytical_tool_traces"
  ADD CONSTRAINT "ai_analytical_tool_traces_result_id_fkey"
  FOREIGN KEY ("result_id") REFERENCES "ai_analytical_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;
