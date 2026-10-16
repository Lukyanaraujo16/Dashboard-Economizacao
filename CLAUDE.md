# CLAUDE.md — Dashboard Economização

Índice mínimo para agentes. As regras vivem em `docs/`; este arquivo só aponta para elas.
Em caso de conflito, `docs/` prevalece.

## Documentação oficial (ler antes de alterar)

| Tema | Documento |
|---|---|
| Produto e requisitos | `docs/00-visao-do-produto.md`, `docs/01-prd.md` |
| Arquitetura e decisões | `docs/02-arquitetura.md`, `docs/08-decisoes-tecnicas.md`, `docs/adr/` |
| Fórmulas e semântica financeira | `docs/11-regras-analiticas.md` |
| Multiempresa (tenant) | `docs/09.9-multiempresa.md` |
| Camada de IA (Consultor/Alfred) | `docs/09.24-convencoes-ia.md` |
| Trilha de resultado e resolução de entidades | `docs/20-consultor-trilha-de-resultado.md` |
| Continuidade analítica e interpretação | `docs/21-continuidade-analitica-conversacional.md` |
| Integração Conta Azul | `docs/04-api-conta-azul.md`, `docs/18-arquitetura-integracao-conta-azul.md` |
| Código, testes e Git | `docs/09-padroes-de-codigo.md`, `docs/09.17-testes.md`, `docs/09.19-git.md` |
| Frontend (Next.js com breaking changes) | `frontend/AGENTS.md` |

## Restrições operacionais

- Commit e push só com autorização explícita, em pedidos separados (`docs/09.19-git.md`).
- Sem deploy, sem acesso à VPS ou à produção, sem migrations em produção sem autorização.
- Sem sincronização com a Conta Azul e sem alteração de dados financeiros reais.
- Preservar alterações locais não relacionadas do working tree.

## Restrições de segurança e financeiras

- Toda execução tem exatamente um tenant, vindo do runtime; nunca do modelo ou do texto do usuário.
- O modelo de linguagem não calcula número oficial nem escolhe período ou tenant. Sem SQL livre.
- Não alterar fórmulas oficiais. BILLING ≠ REALIZED_CASH INFLOW ≠ RECEIVABLE_STOCK; CASH_RESULT ≠ lucro.
- Nenhuma regra específica de cliente (por exemplo, Clínica Life): toda solução é multi-tenant.

## Consultor (advisor)

- Orquestrador: `backend/src/modules/advisor/services/send-advisor-message.ts`.
- Interpretação estruturada compartilhada (período, cardinalidade, entidade):
  `backend/src/modules/advisor/domain/advisor-question-interpretation.ts`.
  Handlers não reextraem um centro de custo já resolvido pelo catálogo do tenant.
- Capabilities publicadas: `backend/src/modules/advisor/domain/analytical/analytical-capability-registry.ts`
  (deny by default).

## Comandos

```bash
pnpm --filter @dashboard-economizacao/backend test        # vitest
pnpm --filter @dashboard-economizacao/backend typecheck
pnpm --filter @dashboard-economizacao/backend lint
pnpm --filter @dashboard-economizacao/backend build
```

Testes multi-turno do consultor: harness em `backend/tests/advisor-c27-stabilization.unit.test.ts`.
