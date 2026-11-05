-- Filtros usados pelo Consultor (modo agente) em cada resposta: centro de custo, categoria,
-- período. Reinjetados no histórico para que perguntas de continuação herdem o escopo.
-- Não guarda valores financeiros nem payload de tool.
--
-- Rollback de emergência:
-- ALTER TABLE "ai_analytical_results" DROP COLUMN IF EXISTS "scope_summary";
-- DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261105180000_advisor_result_scope_summary';

ALTER TABLE "ai_analytical_results" ADD COLUMN "scope_summary" VARCHAR(300);
