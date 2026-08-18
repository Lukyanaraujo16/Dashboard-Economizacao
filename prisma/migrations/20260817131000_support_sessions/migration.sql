-- CreateTable
CREATE TABLE "support_sessions" (
    "id" UUID NOT NULL,
    "operator_user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "redis_session_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_support_sessions_operator_user_id" ON "support_sessions"("operator_user_id");

-- CreateIndex
CREATE INDEX "idx_support_sessions_tenant_started_at" ON "support_sessions"("tenant_id", "started_at");

-- CreateIndex
CREATE INDEX "idx_support_sessions_redis_session_id" ON "support_sessions"("redis_session_id");

-- No máximo uma sessão de suporte aberta por cookie Redis
CREATE UNIQUE INDEX "uq_support_sessions_open_redis_session"
ON "support_sessions"("redis_session_id")
WHERE "ended_at" IS NULL AND "redis_session_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_operator_user_id_fkey"
FOREIGN KEY ("operator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
