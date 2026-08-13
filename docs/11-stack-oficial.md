# Dashboard Economização

# 11 — Stack Oficial

Status: Ativo  
Projeto: Dashboard Economização  
Tipo: Referência Oficial de Stack Tecnológica  
Documento normativo: `docs/11-stack-oficial.md`  
ADR vinculada: `docs/adr/ADR-041-stack-oficial.md`

---

## 1. Objetivo

Este documento é a referência oficial da stack tecnológica do Dashboard Economização.

Ele consolida as tecnologias aprovadas pelas ADRs em `docs/08-decisoes-tecnicas.md`, alinhadas aos padrões da série 09 e ao plano de execução em `docs/10-plano-de-execucao.md`.

Nenhuma biblioteca relevante poderá ser adicionada ao projeto sem atualização deste documento e registro formal da decisão, quando aplicável.

---

## 2. Backend

| Tecnologia | Finalidade | Status | Observações |
|---|---|---|---|
| Node.js 24 LTS | Runtime da API, worker e scheduler | Obrigatório | ADR-040; `.nvmrc` / `.node-version` / `engines` |
| TypeScript | Linguagem oficial do backend | Obrigatório | ADR-006 |
| Fastify | Framework HTTP da API | Obrigatório | ADR-032 |
| @fastify/cookie | Parsing e serialização segura de cookies, incluindo suporte à infraestrutura de cookies HttpOnly da autenticação | Obrigatório | Plugin oficial Fastify adotado para Fastify 5 |
| @fastify/session | Infraestrutura de sessão server-side da aplicação | Obrigatório | Plugin oficial Fastify. O mecanismo definitivo de persistência/store das sessões será definido na fase funcional correspondente e não deverá depender de armazenamento transitório em produção |
| Processo Worker independente | Execução de jobs assíncronos | Obrigatório | ADR-011; implementação conforme Épico 5 |
| Scheduler | Planejamento de tarefas recorrentes; preferência por enfileirar | Obrigatório | ADR-012; implementação conforme Épico 5 |
| BullMQ | Filas de sincronização, analytics, insights, relatórios e notificações | Aprovado | ADR-010; fase futura no plano (Épico 5) |
| Prisma ORM | Acesso tipado ao PostgreSQL e migrations | Obrigatório | ADR-008 |
| @prisma/client | Cliente Prisma em runtime | Obrigatório | ADR-008 |
| tsx | Execução/desenvolvimento local do backend | Aprovado | Presente na fundação; sem ADR própria |

---

## 3. Frontend

| Tecnologia | Finalidade | Status | Observações |
|---|---|---|---|
| Next.js | Aplicação web | Obrigatório | ADR-005 |
| Next.js App Router | Roteamento, layouts e fronteiras server/client | Obrigatório | ADR-039; Pages Router não para novas funcionalidades |
| React | Biblioteca de UI do Next.js | Obrigatório | Implícito à ADR-005 |
| TypeScript | Linguagem oficial do frontend | Obrigatório | ADR-005 |
| Biblioteca de componentes de UI | Design system / componentes | Em avaliação | Pendente em `docs/08` §3 |
| Biblioteca de gráficos | Visualização de indicadores | Em avaliação | Pendente em `docs/08` §3 |

---

## 4. Banco de Dados

| Tecnologia | Finalidade | Status | Observações |
|---|---|---|---|
| PostgreSQL | Fonte de verdade relacional | Obrigatório | ADR-007 |
| Prisma schema / migrations | Modelagem e evolução do schema | Obrigatório | ADR-008; `prisma/` na raiz do monorepo |
| Volume Docker `postgres_data` | Persistência local/dev | Aprovado | ADR-003, ADR-025; compose atual |
| Versão formal de PostgreSQL em produção | Pin de major/minor oficial | Em avaliação | Compose local usa `postgres:17.10-bookworm`; versão de produção ainda listada como pendente em `docs/08` §3 |

---

## 5. Infraestrutura

| Tecnologia | Finalidade | Status | Observações |
|---|---|---|---|
| VPS Linux | Hospedagem do MVP | Obrigatório | ADR-001 |
| Docker + Docker Compose | Empacotamento e orquestração local/produção | Obrigatório | ADR-003 |
| Nginx | Proxy reverso, HTTP/HTTPS e roteamento | Obrigatório | ADR-013 |
| HTTPS | TLS obrigatório em produção | Obrigatório | ADR-014 |
| Let’s Encrypt (ou equivalente compatível) | Certificados e renovação | Aprovado | ADR-015 |
| Redis | Cache, locks e backend do BullMQ | Aprovado | ADR-009; não é fonte definitiva de dados financeiros; Épico 5 |
| Storage com abstração | Logos, relatórios, arquivos de conhecimento | Em avaliação | ADR-029 (local vs S3-compatível pendente) |
| install.sh / update.sh / backup.sh / restore.sh | Operação automatizada | Aprovado | ADR-016 a ADR-024 |
| Deploy modular em 1 VPS | Escala inicial do MVP | Obrigatório | ADR-026, ADR-027 |
| Distro Linux final da VPS | SO concreto de produção | Em avaliação | ADR-002; pendente em `docs/08` §3 |
| Plataforma SaaS de observabilidade | Coleta/alertas externos | Em avaliação | Contrato em `docs/09.12`; plataforma não escolhida |

---

## 6. IA

| Tecnologia | Finalidade | Status | Observações |
|---|---|---|---|
| Abstração de provedor de IA | Desacoplar o Consultor do fornecedor | Obrigatório | ADR-028 |
| OpenAI (candidato inicial) | Provedor possível da primeira integração | Em avaliação | ADR-028; modelo, SDK e custos pendentes |
| Motor Analítico determinístico | Fonte oficial de KPIs e cálculos financeiros | Obrigatório | ADR-031; LLM não calcula KPI oficial (`docs/09.24`) |
| Context Builder / Chat / Insights | Capabilidades do Consultor | Futuro | Épico 4 em `docs/10-plano-de-execucao.md` |

---

## 7. Testes

| Tecnologia | Finalidade | Status | Observações |
|---|---|---|---|
| Estratégia de testes da série 09 | Prioridades: tenant, auth, cálculos, sync, IA | Obrigatório | `docs/09.17-testes.md` |
| Vitest | Runner de testes do backend na fundação | Aprovado | Presente em `backend/package.json`; biblioteca oficial de testes ainda pendente de consolidação formal em `docs/08` §3 |
| Biblioteca de testes consolidada (ADR) | Padronização definitiva FE/BE | Em avaliação | Pendente em `docs/08` §3 |

---

## 8. Qualidade

| Tecnologia | Finalidade | Status | Observações |
|---|---|---|---|
| TypeScript strict (série 09.2) | Tipagem e fronteiras seguras | Obrigatório | `docs/09.2-convencoes-typescript.md` |
| ESLint | Lint do monorepo | Aprovado | Fundação atual |
| typescript-eslint | Regras TypeScript no ESLint | Aprovado | Fundação atual |
| Prettier | Formatação | Aprovado | Fundação atual |
| Biblioteca de validação de entrada | Schemas nas fronteiras HTTP/jobs | Em avaliação | Pendente em `docs/08` §3 |
| Fluxo Doc → ADR → Impl → Testes → Auditoria → Commit → Push | Qualidade de processo | Obrigatório | ADR-037 |

---

## 9. Ferramentas de Desenvolvimento

| Tecnologia | Finalidade | Status | Observações |
|---|---|---|---|
| pnpm | Gerenciador de pacotes e workspaces | Obrigatório | ADR-038; lockfile único |
| pnpm workspaces | Monorepo simples | Obrigatório | ADR-033, ADR-034, ADR-038 |
| Node.js 24 LTS | Runtime de desenvolvimento e CI | Obrigatório | ADR-040 |
| TypeScript | Compilação e typecheck | Obrigatório | ADR-005, ADR-006 |
| Cursor / Codex | Assistentes de implementação | Aprovado | Subordinados à documentação oficial (`docs/07`, série 09) |
| Git | Controle de versão | Obrigatório | `docs/09.19-git.md` |

---

## 10. Produção

| Tecnologia | Finalidade | Status | Observações |
|---|---|---|---|
| VPS Linux + Docker Compose | Runtime de produção do MVP | Obrigatório | ADR-001, ADR-003, ADR-004 |
| Nginx + HTTPS | Entrada pública segura | Obrigatório | ADR-013, ADR-014 |
| PostgreSQL em volume persistente | Dados de negócio | Obrigatório | ADR-007, ADR-025 |
| Redis (quando ativado) | Filas/cache/locks | Aprovado | ADR-009; Épico 5 |
| Scripts install/update/backup/restore | Operação | Aprovado | ADR-016 a ADR-024 |
| Backend como autoridade | Autorização, tenant e regras | Obrigatório | ADR-031; `docs/09.8`, `docs/09.9` |
| Política de backup e retenção | Continuidade e compliance operacional | Em avaliação | Pendente em `docs/08` §3 |

---

## 11. Dependências Futuras

| Tecnologia | Finalidade | Status | Observações |
|---|---|---|---|
| Redis + BullMQ + Worker + Scheduler | Processamento assíncrono completo | Futuro | Aprovados em ADR; execução no Épico 5 |
| Autenticação / sessão | Login, middleware e store persistente de sessão | Em avaliação | `@fastify/cookie` e `@fastify/session` já obrigatórios na seção Backend; login, middleware e store definitivo seguem no Épico 1.1 |
| OAuth Conta Azul | Integração ERP | Futuro | Épico 2; regras em `docs/04` |
| Biblioteca de UI | Interface do painel | Em avaliação | `docs/08` §3 |
| Biblioteca de gráficos | Dashboard | Em avaliação | `docs/08` §3 |
| Storage definitivo | Arquivos persistentes | Em avaliação | ADR-029 |
| Notificações internas | Central de notificações | Futuro | Épico 5 |
| OneSignal | Push (pós-MVP / evolução) | Futuro | Citado no plano; sem ADR de adoção ainda |
| PWA | Instalação / experiência avançada | Futuro | Citado no plano; fora do MVP inicial na visão do produto |
| Observabilidade SaaS | Métricas/alertas externos | Em avaliação | `docs/09.12` |

---

## 12. Bibliotecas Proibidas

| Tecnologia | Finalidade pretendida (rejeitada) | Status | Observações |
|---|---|---|---|
| Express | Framework HTTP | Descontinuado | Rejeitado na ADR-032 |
| NestJS | Framework HTTP/DI | Descontinuado | Rejeitado na ADR-032 |
| API Routes do Next.js como núcleo de backend | API de negócio | Descontinuado | ADR-006 |
| Pages Router (novas funcionalidades) | Roteamento frontend | Descontinuado | ADR-039 |
| npm / yarn / bun (como gerenciador do projeto) | Pacotes | Descontinuado | Sem nova ADR; ADR-038 exige pnpm |
| Turborepo / Nx (e orquestradores equivalentes no MVP) | Monorepo complexo | Descontinuado | ADR-033, ADR-034 |
| Vercel + Supabase como infra base do MVP | Hospedagem | Descontinuado | ADR-001 |
| Redis como fonte definitiva de dados financeiros | Persistência financeira | Descontinuado | ADR-009 |
| Acoplamento direto a um único modelo de IA sem abstração | Integração IA | Descontinuado | ADR-028 |
| Credenciais/secrets no frontend | Configuração | Descontinuado | ADR-031; `docs/09.8` |

Qualquer biblioteca relevante ausente deste documento **não está autorizada** até ser registrada aqui (e em ADR, quando a decisão for arquitetural).

---

## 13. Critérios para adoção de novas dependências

Toda nova biblioteca deverá:

- resolver problema recorrente;
- reduzir código próprio de infraestrutura;
- aumentar segurança;
- melhorar manutenção;
- possuir ampla adoção e maturidade.

Além disso, no Dashboard Economização:

1. Atualizar `docs/11-stack-oficial.md` antes da instalação.
2. Registrar ADR em `docs/08-decisoes-tecnicas.md` e/ou `docs/adr/` quando a escolha for arquitetural ou irreversível.
3. Respeitar isolamento multiempresa, backend como autoridade e a série 09.
4. Não introduzir complexidade especulativa (ADR-035, `docs/09.25`).
5. Não substituir tecnologias Obrigatórias sem decisão formal que atualize este documento.

---

## 14. Diretriz Final

A stack oficial do projeto é definida exclusivamente por este documento.

Implementações, prompts e sugestões automáticas que contradisserem esta referência deverão ser rejeitadas até atualização formal da documentação.
