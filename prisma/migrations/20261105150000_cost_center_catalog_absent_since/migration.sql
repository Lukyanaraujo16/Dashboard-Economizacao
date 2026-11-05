-- Centro de custo excluído no Conta Azul (ausente do snapshot completo do catálogo).
-- Sem backfill: o próximo sync completo de cada integration preenche a coluna e descarta
-- os rateios desses centros, reenfileirando os títulos afetados para reconsulta.
--
-- Rollback de emergência (rateios já descartados voltam só via reconsulta das parcelas):
-- ALTER TABLE "cost_centers" DROP COLUMN IF EXISTS "catalog_absent_since";
-- DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261105150000_cost_center_catalog_absent_since';

ALTER TABLE "cost_centers" ADD COLUMN "catalog_absent_since" TIMESTAMPTZ(3);
