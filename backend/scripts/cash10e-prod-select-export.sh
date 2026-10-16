#!/usr/bin/env bash
# CORREÇÃO 10-E — export READ-ONLY do Postgres de produção (VPS).
#
# Executar NA VPS (não altera checkout / .config / .local):
#   bash cash10e-prod-select-export.sh > /tmp/cash10e-prod-export.json
#
# Depois copiar o JSON para a máquina de desenvolvimento e alimentar
# scripts/cash10e-prod-readonly-project.ts
#
# NÃO faz INSERT/UPDATE/DELETE. Só SELECT via docker exec.
set -euo pipefail

CONTAINER="${DASHBOARD_PG_CONTAINER:-dashboard-economizacao-postgres-1}"

docker exec "$CONTAINER" sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At -F ","' <<'SQL' >/dev/null
SELECT 1;
SQL

docker exec -i "$CONTAINER" sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -P pager=off' <<'SQL'
\pset format unaligned
\pset tuples_only off
\echo '===BEGIN_JSON==='
SELECT json_build_object(
  'exportedAt', now(),
  'mode', 'READ_ONLY_SELECT',
  'tenants', (
    SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.display_name), '[]'::json)
    FROM (
      SELECT id, name, display_name, status::text AS status
      FROM tenants
      WHERE status = 'ACTIVE'
    ) t
  ),
  'life', json_build_object(
    'tenantId', 'cce88634-0d21-4292-8d1c-027ce8c652a0',
    'stalePairs', (
      SELECT coalesce(json_agg(row_to_json(x)), '[]'::json)
      FROM (
        SELECT
          ft.id,
          ft.external_id,
          ft.installment_external_id,
          ft.transaction_type::text AS transaction_type,
          ft.lifecycle_status::text AS lifecycle_status,
          ft.net_amount::text AS net_amount,
          ft.gross_amount::text AS gross_amount,
          ft.occurred_on::text AS occurred_on,
          ft.financial_account_external_id,
          ft.financial_transfer_id,
          ft.synced_at,
          ft.payment_method
        FROM financial_transactions ft
        WHERE ft.tenant_id = 'cce88634-0d21-4292-8d1c-027ce8c652a0'
          AND ft.installment_external_id IN (
            '792e421e-65de-4116-84d4-203edf3ae454',
            '00fcc4f3-1ec7-458f-8560-b68aaa283711'
          )
        ORDER BY ft.installment_external_id, ft.external_id
      ) x
    ),
    'receipt1313', (
      SELECT coalesce(json_agg(row_to_json(x)), '[]'::json)
      FROM (
        SELECT
          ft.id,
          ft.external_id,
          ft.installment_external_id,
          ft.transaction_type::text AS transaction_type,
          ft.lifecycle_status::text AS lifecycle_status,
          ft.net_amount::text AS net_amount,
          ft.occurred_on::text AS occurred_on,
          ft.financial_account_external_id,
          ft.financial_transfer_id
        FROM financial_transactions ft
        WHERE ft.tenant_id = 'cce88634-0d21-4292-8d1c-027ce8c652a0'
          AND ft.occurred_on = DATE '2026-08-12'
          AND ft.net_amount = 1313
        ORDER BY ft.external_id
      ) x
    ),
    'transfersAug', (
      SELECT coalesce(json_agg(row_to_json(x)), '[]'::json)
      FROM (
        SELECT
          id, external_id, occurred_on::text AS occurred_on,
          amount::text AS amount,
          source_financial_account_external_id,
          destination_financial_account_external_id,
          match_status::text AS match_status
        FROM financial_transfers
        WHERE tenant_id = 'cce88634-0d21-4292-8d1c-027ce8c652a0'
          AND occurred_on >= DATE '2026-08-01'
          AND occurred_on < DATE '2026-09-01'
        ORDER BY occurred_on, external_id
      ) x
    ),
    'augRealized', (
      SELECT json_build_object(
        'inflows', coalesce(sum(CASE WHEN transaction_type = 'RECEIPT' THEN net_amount ELSE 0 END),0)::text,
        'outflows', coalesce(sum(CASE WHEN transaction_type = 'DISBURSEMENT' THEN net_amount ELSE 0 END),0)::text
      )
      FROM financial_transactions
      WHERE tenant_id = 'cce88634-0d21-4292-8d1c-027ce8c652a0'
        AND lifecycle_status = 'ACTIVE'
        AND financial_transfer_id IS NULL
        AND occurred_on >= DATE '2026-08-01'
        AND occurred_on < DATE '2026-09-01'
    )
  ),
  'blooty', json_build_object(
    'tenantId', '6964da8c-4a44-4032-858a-7b4be0029e06',
    'transfersAugCount', (
      SELECT count(*) FROM financial_transfers
      WHERE tenant_id = '6964da8c-4a44-4032-858a-7b4be0029e06'
        AND occurred_on >= DATE '2026-08-01' AND occurred_on < DATE '2026-09-01'
    ),
    'receipt20400', (
      SELECT coalesce(json_agg(row_to_json(x)), '[]'::json)
      FROM (
        SELECT
          id, external_id, installment_external_id,
          transaction_type::text AS transaction_type,
          lifecycle_status::text AS lifecycle_status,
          net_amount::text AS net_amount,
          occurred_on::text AS occurred_on,
          financial_account_external_id,
          financial_transfer_id
        FROM financial_transactions
        WHERE tenant_id = '6964da8c-4a44-4032-858a-7b4be0029e06'
          AND external_id = 'e8eb90cd-a827-4cdf-9a9c-e0cb1715d80d'
      ) x
    ),
    'titles24017', (
      SELECT coalesce(json_agg(row_to_json(x)), '[]'::json)
      FROM (
        SELECT
          id, external_id, installment_external_id,
          transaction_type::text AS transaction_type,
          lifecycle_status::text AS lifecycle_status,
          net_amount::text AS net_amount,
          occurred_on::text AS occurred_on,
          financial_transfer_id,
          synced_at,
          payment_method
        FROM financial_transactions
        WHERE tenant_id = '6964da8c-4a44-4032-858a-7b4be0029e06'
          AND net_amount = 24017.08
          AND occurred_on >= DATE '2026-08-01'
          AND occurred_on < DATE '2026-09-01'
        ORDER BY external_id
      ) x
    ),
    'augRealized', (
      SELECT json_build_object(
        'inflows', coalesce(sum(CASE WHEN transaction_type = 'RECEIPT' THEN net_amount ELSE 0 END),0)::text,
        'outflows', coalesce(sum(CASE WHEN transaction_type = 'DISBURSEMENT' THEN net_amount ELSE 0 END),0)::text
      )
      FROM financial_transactions
      WHERE tenant_id = '6964da8c-4a44-4032-858a-7b4be0029e06'
        AND lifecycle_status = 'ACTIVE'
        AND financial_transfer_id IS NULL
        AND occurred_on >= DATE '2026-08-01'
        AND occurred_on < DATE '2026-09-01'
    )
  ),
  'marielle', json_build_object(
    'tenantId', '03b97659-2859-4112-bc09-d9789e1d15c5',
    'transfersAug', (
      SELECT coalesce(json_agg(row_to_json(x)), '[]'::json)
      FROM (
        SELECT
          id, external_id, occurred_on::text AS occurred_on,
          amount::text AS amount, match_status::text AS match_status
        FROM financial_transfers
        WHERE tenant_id = '03b97659-2859-4112-bc09-d9789e1d15c5'
          AND occurred_on >= DATE '2026-07-31'
          AND occurred_on < DATE '2026-09-01'
        ORDER BY occurred_on, external_id
      ) x
    ),
    'augRealized', (
      SELECT json_build_object(
        'inflows', coalesce(sum(CASE WHEN transaction_type = 'RECEIPT' THEN net_amount ELSE 0 END),0)::text,
        'outflows', coalesce(sum(CASE WHEN transaction_type = 'DISBURSEMENT' THEN net_amount ELSE 0 END),0)::text
      )
      FROM financial_transactions
      WHERE tenant_id = '03b97659-2859-4112-bc09-d9789e1d15c5'
        AND lifecycle_status = 'ACTIVE'
        AND financial_transfer_id IS NULL
        AND occurred_on >= DATE '2026-08-01'
        AND occurred_on < DATE '2026-09-01'
    )
  ),
  'inventory', (
    SELECT coalesce(json_agg(row_to_json(i) ORDER BY i.display_name), '[]'::json)
    FROM (
      SELECT
        t.id AS tenant_id,
        t.display_name,
        (SELECT count(*) FROM financial_transactions ft WHERE ft.tenant_id = t.id AND ft.lifecycle_status = 'ACTIVE') AS active_tx,
        (SELECT count(*) FROM financial_transfers tr WHERE tr.tenant_id = t.id) AS transfers,
        (SELECT count(*) FROM financial_transfers tr WHERE tr.tenant_id = t.id AND tr.match_status = 'MATCHED') AS matched,
        (SELECT count(*) FROM financial_transfers tr WHERE tr.tenant_id = t.id AND tr.match_status = 'UNMATCHED') AS unmatched,
        (SELECT count(*) FROM financial_transfers tr WHERE tr.tenant_id = t.id AND tr.match_status = 'AMBIGUOUS') AS ambiguous,
        (
          SELECT count(*) FROM (
            SELECT installment_external_id
            FROM financial_transactions
            WHERE tenant_id = t.id AND lifecycle_status = 'ACTIVE'
            GROUP BY installment_external_id
            HAVING count(*) > 1
          ) d
        ) AS multi_active_installments,
        (SELECT min(occurred_on)::text FROM financial_transactions WHERE tenant_id = t.id) AS tx_min,
        (SELECT max(occurred_on)::text FROM financial_transactions WHERE tenant_id = t.id) AS tx_max
      FROM tenants t
      WHERE t.status = 'ACTIVE'
    ) i
  )
)::text;
\echo '===END_JSON==='
SQL
