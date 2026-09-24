Dashboard Economização

08 — Decisões Técnicas

Status: Ativo
Projeto: Dashboard Economização
Tipo: Registro Oficial de Decisões Técnicas

⸻

1. Objetivo

Este documento registra as decisões técnicas relevantes do Dashboard Economização.

Seu objetivo é documentar:

* a decisão tomada;
* a justificativa;
* as alternativas consideradas;
* os impactos positivos;
* os impactos negativos;
* a data da decisão;
* o status da decisão.

Nenhuma decisão arquitetural importante deverá permanecer apenas no histórico de conversas.

⸻

2. Metodologia

Cada decisão receberá um identificador único:

ADR-001
ADR-002
ADR-003
...

Toda decisão deverá conter, quando aplicável:

* Status;
* Contexto;
* Decisão;
* Alternativas avaliadas;
* Consequências;
* Motivo da escolha.

⸻

ADR-001 — Infraestrutura Base

Status

Aprovada

Contexto

O Dashboard Economização será um SaaS multiempresa com sincronização automática da API Conta Azul, processamento assíncrono, filas, inteligência artificial, geração de relatórios e crescimento gradual da base de clientes.

Foram avaliadas duas abordagens principais:

* serviços gerenciados com Vercel + Supabase;
* infraestrutura própria baseada em VPS Linux.

Decisão

O MVP utilizará infraestrutura baseada em VPS Linux.

Alternativas avaliadas

Alternativa A

Vercel + Supabase.

Alternativa B

VPS Linux.

Escolha

VPS Linux.

Motivos

* menor custo mensal inicial;
* maior controle operacional;
* suporte natural a processos persistentes;
* workers independentes;
* filas;
* Redis local;
* PostgreSQL local;
* maior liberdade para integrações futuras;
* maior adequação ao processamento contínuo da aplicação;
* possibilidade de manter aplicação, banco, Redis e workers inicialmente na mesma máquina.

Consequências positivas

* custo previsível;
* controle total da infraestrutura;
* facilidade para executar workers permanentes;
* facilidade para jobs recorrentes;
* liberdade para configurar Nginx, Redis, banco e processos;
* possibilidade de migração futura de componentes para serviços gerenciados sem reconstrução conceitual do sistema.

Consequências negativas

* responsabilidade pela administração da infraestrutura;
* necessidade de monitoramento;
* responsabilidade por backups;
* responsabilidade por atualizações do sistema operacional;
* responsabilidade pela segurança da VPS.

⸻

ADR-002 — Sistema Operacional da VPS

Status

Aprovada

Decisão

A infraestrutura de produção utilizará Linux em VPS.

A distribuição e versão exatas serão escolhidas no momento da contratação da infraestrutura, priorizando versão LTS estável e compatível com Docker.

⸻

ADR-003 — Conteinerização

Status

Aprovada

Decisão

O projeto utilizará Docker e Docker Compose desde a Fase 0.

Motivos

* padronização entre desenvolvimento e produção;
* isolamento de serviços;
* instalação automatizada;
* simplificação de deploy;
* facilidade de migração futura;
* redução de dependências instaladas diretamente no host.

⸻

ADR-004 — Arquitetura da Aplicação

Status

Aprovada

Decisão

A aplicação será dividida em processos independentes.

Estrutura conceitual:

Internet
    │
  Nginx
    │
    ├───────────────┐
    │               │
    ▼               ▼
 Next.js         Node API
                     │
           ┌─────────┼─────────┐
           ▼         ▼         ▼
      PostgreSQL   Redis    Storage
                     │
                     ▼
                  BullMQ
                     │
           ┌─────────┴─────────┐
           ▼                   ▼
        Worker             Scheduler

Motivos

* desacoplamento;
* manutenção;
* processamento assíncrono;
* separação de responsabilidades;
* possibilidade de escalar componentes individualmente no futuro.

⸻

ADR-005 — Frontend

Status

Aprovada

Decisão

Utilizar Next.js com TypeScript.

Motivos

* tipagem;
* ecossistema maduro;
* boa experiência de desenvolvimento;
* suporte a aplicações responsivas;
* boa organização para aplicação web moderna;
* compatibilidade com deploy em VPS via Node.js e Docker.

⸻

ADR-006 — Backend

Status

Aprovada

Decisão

Utilizar backend Node.js com TypeScript separado do Next.js.

O backend principal não utilizará as rotas de API do Next.js como núcleo da aplicação.

Motivos

* workers permanentes;
* sincronizações automáticas;
* filas;
* OAuth;
* processamento em background;
* separação clara entre frontend e regras de negócio;
* maior controle sobre o ciclo de vida do processo.

⸻

ADR-007 — Banco de Dados

Status

Aprovada

Decisão

Utilizar PostgreSQL.

Motivos

* robustez;
* maturidade;
* consistência;
* bom suporte a consultas financeiras e analíticas;
* excelente compatibilidade com Prisma;
* capacidade de crescimento;
* suporte amplo no ecossistema Node.js.

⸻

ADR-008 — ORM

Status

Aprovada

Decisão

Utilizar Prisma ORM.

Motivos

* tipagem;
* migrations;
* produtividade;
* legibilidade;
* integração com TypeScript;
* manutenção do modelo de dados.

⸻

ADR-009 — Redis

Status

Aprovada

Decisão

Utilizar Redis.

Responsabilidades iniciais

* infraestrutura para BullMQ;
* cache;
* coordenação de jobs quando necessário;
* apoio a locks ou estados efêmeros quando aplicável.

Redis não será fonte definitiva de dados financeiros.

⸻

ADR-010 — Filas

Status

Aprovada

Decisão

Utilizar BullMQ.

Motivos

* integração com Redis;
* processamento em background;
* retries;
* controle de concorrência;
* jobs;
* suporte a processamento recorrente;
* compatibilidade com workers Node.js.

Casos de uso previstos

* sincronização Conta Azul;
* processamento analítico;
* insights;
* relatórios;
* notificações;
* tarefas internas.

⸻

ADR-011 — Worker

Status

Aprovada

Decisão

O projeto possuirá processo de Worker independente da API.

O Worker será responsável por executar jobs assíncronos.

A API não deverá executar tarefas pesadas no ciclo normal da requisição quando elas puderem ser processadas em background.

⸻

ADR-012 — Scheduler

Status

Aprovada

Decisão

O projeto possuirá processo ou responsabilidade de Scheduler para tarefas recorrentes.

Entre elas:

* planejamento de sincronizações;
* tarefas periódicas;
* processamento recorrente necessário ao sistema.

O Scheduler deverá preferencialmente disparar jobs para filas, em vez de realizar diretamente operações pesadas.

⸻

ADR-013 — Proxy Reverso

Status

Aprovada

Decisão

Utilizar Nginx como proxy reverso da aplicação na VPS.

Responsabilidades previstas

* exposição HTTP/HTTPS;
* roteamento;
* SSL;
* headers;
* encaminhamento para frontend e API;
* configuração adequada para produção.

⸻

ADR-014 — HTTPS

Status

Aprovada

Decisão

HTTPS será obrigatório em produção.

O sistema poderá ser instalado inicialmente apenas por IP ou HTTP para desenvolvimento, homologação ou enquanto o domínio ainda não estiver disponível.

Quando o domínio estiver configurado, a aplicação deverá permitir habilitar HTTPS sem reinstalação completa.

⸻

ADR-015 — Certificado SSL

Status

Aprovada

Decisão

O instalador deverá possuir suporte à geração e configuração automatizada de certificado SSL utilizando solução compatível com Let’s Encrypt.

A renovação do certificado deverá ser automática.

A implementação final será definida no documento de infraestrutura.

⸻

ADR-016 — Instalação Automatizada

Status

Aprovada

Decisão

O Dashboard Economização deverá possuir instalação automatizada para uma VPS nova.

O principal ponto de entrada será:

install.sh

O objetivo é reduzir ao mínimo operações manuais de configuração.

⸻

ADR-017 — install.sh Interativo

Status

Aprovada

Decisão

O install.sh deverá ser interativo.

Ele deverá solicitar apenas informações que não possam ser determinadas de forma segura automaticamente.

Perguntas previstas incluem:

* IP público da máquina;
* domínio;
* se o domínio será utilizado naquele momento;
* se HTTPS será configurado naquele momento;
* e-mail para certificado quando necessário;
* ambiente;
* demais informações realmente necessárias à instalação.

Perguntas poderão ser refinadas no documento de infraestrutura.

⸻

ADR-018 — Responsabilidades do install.sh

Status

Aprovada

Decisão

O instalador deverá ser preparado para automatizar, quando aplicável:

* validações do sistema operacional;
* validação ou instalação das dependências necessárias;
* Docker;
* Docker Compose;
* estrutura de diretórios;
* arquivos de ambiente;
* geração segura de segredos;
* PostgreSQL;
* Redis;
* frontend;
* API;
* Worker;
* Scheduler;
* Nginx;
* migrations;
* volumes persistentes;
* inicialização dos serviços;
* domínio;
* SSL;
* renovação de SSL;
* verificações de saúde;
* resumo final da instalação.

A implementação deverá respeitar confirmação antes de operações potencialmente destrutivas.

⸻

ADR-019 — Idempotência do Instalador

Status

Aprovada

Decisão

O install.sh deverá ser idempotente sempre que tecnicamente viável.

Executar novamente o instalador não deverá:

* apagar dados existentes;
* recriar banco destrutivamente;
* duplicar configurações;
* gerar serviços duplicados;
* substituir credenciais existentes silenciosamente;
* invalidar instalação saudável sem confirmação.

⸻

ADR-020 — Instalação sem Domínio

Status

Aprovada

Decisão

O instalador deverá permitir concluir a instalação sem domínio.

Nesse cenário, a aplicação poderá inicialmente ser acessada pelo IP e porta/configuração definida.

Posteriormente deverá ser possível configurar domínio e HTTPS sem reinstalar todo o sistema.

⸻

ADR-021 — Scripts Operacionais

Status

Aprovada

Decisão

Além do install.sh, a arquitetura deverá prever scripts separados para responsabilidades operacionais distintas.

Arquivos previstos:

* install.sh;
* update.sh;
* backup.sh;
* restore.sh.

A criação e implementação serão realizadas nas fases apropriadas.

⸻

ADR-022 — update.sh

Status

Aprovada

Decisão

Atualizações de uma instalação existente deverão utilizar fluxo separado do instalador inicial.

O objetivo do update.sh será atualizar uma instalação existente sem executar novamente todo o processo de provisionamento.

⸻

ADR-023 — backup.sh

Status

Aprovada

Decisão

O projeto deverá possuir mecanismo automatizado de backup.

A estratégia detalhada será definida no documento de infraestrutura e operação.

O backup deverá contemplar, no mínimo, dados cuja perda comprometa a plataforma.

⸻

ADR-024 — restore.sh

Status

Aprovada

Decisão

O projeto deverá possuir procedimento automatizado e documentado para restauração.

Backup sem restore validável não será considerado estratégia de backup completa.

⸻

ADR-025 — Persistência

Status

Aprovada

Decisão

Dados persistentes não poderão depender do ciclo de vida dos containers.

Volumes ou armazenamento equivalente deverão preservar, quando aplicável:

* PostgreSQL;
* arquivos necessários;
* dados operacionais que precisem persistência.

Redis deverá ser configurado conforme a necessidade real de persistência operacional.

⸻

ADR-026 — Deploy Modular

Status

Aprovada

Decisão

Mesmo que frontend, API, PostgreSQL, Redis, Worker e Scheduler iniciem na mesma VPS, eles deverão permanecer logicamente desacoplados.

Isso permitirá futuramente mover individualmente:

* frontend;
* API;
* banco;
* Redis;
* workers;
* arquivos;

sem reconstruir o produto.

⸻

ADR-027 — Escalabilidade Inicial

Status

Aprovada

Decisão

O MVP não utilizará arquitetura distribuída desnecessária.

Inicialmente, uma única VPS poderá hospedar os componentes principais.

Escala horizontal ou separação física de serviços somente deverá ocorrer quando houver necessidade comprovada.

⸻

ADR-028 — Provedor de IA

Status

Aprovada para o motor reativo (F13).
IMPLEMENTADA LOCALMENTE — AGUARDANDO HOMOLOGAÇÃO REAL (F13.1–F13.6).
F14 NÃO iniciada. Produção NÃO homologada.

Decisão

A arquitetura possui abstração de provedor de inteligência artificial (`IaProvider`).

O sistema não fica acoplado a um vendor específico.

Providers suportados: OPENAI e ANTHROPIC. A escolha é por tenant (`ai_tenant_settings.provider` / `model`), sem migration para trocar vendor. Credenciais são da plataforma (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`). Sem BYOK. Não há fallback cruzado entre vendors. Não há retry automático de `generate`.

Rate limit de plataforma no Redis: 20 msg/10 min por user+tenant e 60/10 min por tenant. 429 `RATE_LIMITED` e `ai_run` `LIMIT_BLOCKED` só do limiter da plataforma. `RATE_LIMIT` do vendor → 503 + `ai_run` FAILED. Redis fail-closed só no Consultor (503), sem derrubar Dashboard/Relatórios.

⸻

ADR-029 — Storage

Status

Pendente de definição final

Decisão atual

O sistema deverá possuir abstração para armazenamento de arquivos.

Ela deverá suportar inicialmente:

* logos;
* relatórios;
* arquivos futuros da base de conhecimento quando aplicável.

A decisão entre armazenamento local persistente e serviço compatível com S3 será tomada antes da implementação desse módulo.

⸻

ADR-030 — Filosofia de Infraestrutura

Status

Aprovada

Decisão

A infraestrutura do MVP seguirá os princípios:

* simples de operar;
* automatizada;
* reproduzível;
* segura;
* econômica;
* preparada para migração futura;
* sem dependência desnecessária de serviços proprietários.

⸻

ADR-031 — Princípios Técnicos Gerais

Status

Aprovada

Decisão

O desenvolvimento seguirá:

* documentação antes da implementação;
* simplicidade antes de complexidade;
* backend como autoridade das regras;
* isolamento por tenant;
* processos pesados em background;
* cálculos financeiros determinísticos;
* IA utilizada para interpretação;
* nenhuma credencial no frontend;
* nenhuma decisão crítica baseada apenas em memória;
* automação operacional desde o início.

⸻

3. Itens Ainda Pendentes

Ainda deverão ser definidos formalmente:

* biblioteca ou estratégia de autenticação;
* estratégia de sessão;
* versão de PostgreSQL;
* versão de Redis;
* versão de Docker;
* biblioteca de validação;
* biblioteca de testes;
* biblioteca de UI;
* biblioteca de gráficos;
* storage inicial;
* provedor/modelo inicial da IA;
* plataforma SaaS específica de observabilidade (o contrato de instrumentação está em `docs/09.12-observabilidade.md`);
* política de backup;
* política de retenção;
* distribuição Linux final da VPS;
* especificação mínima da VPS.

Itens resolvidos por ADRs posteriores (mantidos aqui apenas como histórico de resolução):

* framework backend Node.js — ADR-032 (Fastify);
* estrutura do monorepo — ADR-033 e ADR-034;
* gerenciador de pacotes — ADR-038 (pnpm);
* Next.js App Router — ADR-039;
* versão mínima de Node.js — ADR-040 (Node.js 24 LTS);
* runtime híbrido do piloto — ADR-051;
* modo HTTP temporário explícito — ADR-052;
* bootstrap do primeiro SUPER_ADMIN — ADR-053.

Esses itens deverão ser definidos antes da fase correspondente.

⸻

4. Regra de Atualização

Nova decisão técnica relevante deverá ser registrada neste documento.

Uma decisão aprovada não deverá ser alterada silenciosamente.

Quando uma decisão for substituída, deverá permanecer historicamente identificável como:

* substituída;
* depreciada;
* cancelada;

e a nova ADR deverá explicar a mudança.

⸻

5. Diretriz Final

As decisões deste documento existem para impedir que tecnologias e estruturas críticas sejam escolhidas de forma diferente a cada fase de desenvolvimento.

O Dashboard Economização deverá possuir uma arquitetura coerente do primeiro commit até produção.

⸻

---

# ADR-032 — Framework Backend

## Status

Aprovada

## Contexto

Após análise entre Express, Fastify e NestJS, foi decidido utilizar um framework que oferecesse alta performance, excelente suporte a TypeScript, arquitetura simples e baixo nível de abstração, evitando excesso de configuração e complexidade desnecessária para o MVP.

## Decisão

O backend oficial do Dashboard Economização utilizará Fastify.

## Alternativas avaliadas

Express

Vantagens:

- extremamente conhecido;
- enorme comunidade;
- grande quantidade de exemplos.

Desvantagens:

- maior quantidade de decisões arquiteturais deixadas para o projeto;
- maior necessidade de padronização manual.

NestJS

Vantagens:

- arquitetura extremamente organizada;
- injeção de dependência nativa;
- excelente escalabilidade.

Desvantagens:

- elevado nível de abstração;
- estrutura muito verbosa para o tamanho atual do projeto;
- maior curva de aprendizado;
- excesso de convenções para um MVP.

Fastify

Vantagens:

- alta performance;
- excelente integração com TypeScript;
- arquitetura simples;
- baixo overhead;
- código explícito;
- grande flexibilidade;
- ótima integração com Prisma, Redis e BullMQ.

## Escolha

Fastify.

## Consequências

Positivas

- backend mais leve;
- maior controle da arquitetura;
- menor quantidade de "mágica";
- melhor legibilidade;
- excelente desempenho.

Negativas

- menor quantidade de exemplos quando comparado ao Express;
- menor comunidade quando comparado ao Express.

---

# ADR-033 — Estrutura Física do Repositório

## Status

Aprovada

## Decisão

O projeto será organizado utilizando uma estrutura modular simples.

Estrutura prevista:

frontend/
backend/
worker/
packages/
infrastructure/
prisma/
docs/
.github/

A estrutura poderá evoluir futuramente sem alterar o conceito arquitetural.

## Motivos

- simplicidade;
- separação de responsabilidades;
- facilidade de manutenção;
- facilidade de localização de arquivos;
- menor acoplamento.

Não será adotado Turborepo, Nx ou solução semelhante nesta fase do projeto.

---

# ADR-034 — Estratégia de Monorepositório

## Status

Aprovada

## Decisão

O Dashboard Economização utilizará um monorepositório simples.

Não será utilizada infraestrutura complexa de monorepo durante o MVP.

Caso futuramente o produto passe a possuir:

- aplicativo mobile;
- SDK;
- múltiplos frontends;
- bibliotecas compartilhadas significativas;

essa decisão poderá ser revisada.

## Motivos

- reduzir complexidade inicial;
- acelerar desenvolvimento;
- facilitar manutenção;
- evitar dependências desnecessárias.

---

# ADR-035 — Filosofia de Evolução da Arquitetura

## Status

Aprovada

## Decisão

A arquitetura deverá evoluir somente quando houver necessidade comprovada.

Não deverão ser adicionadas tecnologias, frameworks ou camadas arquiteturais apenas por tendência de mercado.

Toda nova tecnologia deverá justificar claramente:

- problema resolvido;
- benefício esperado;
- impacto operacional;
- impacto na manutenção;
- impacto na curva de aprendizado.

## Princípios

- simplicidade antes de complexidade;
- necessidade antes de tendência;
- clareza antes de abstração;
- produtividade antes de sofisticação.

---

# ADR-036 — Modularização da Fundação

## Status

Aprovada

## Decisão

A Fase 0 será implementada em pequenas etapas independentes.

Estrutura prevista:

Fase 0.1 — Inicialização do projeto

Fase 0.2 — Docker

Fase 0.3 — Frontend

Fase 0.4 — Backend

Fase 0.5 — Banco de Dados

Fase 0.6 — Redis

Fase 0.7 — BullMQ

Fase 0.8 — Integração Geral

Fase 0.9 — Auditoria e Validação

Cada etapa deverá possuir:

- objetivo específico;
- escopo limitado;
- critérios de aceite próprios;
- validação independente;
- possibilidade de auditoria;
- possibilidade de rollback.

## Motivos

- menor risco;
- commits menores;
- revisões menores;
- maior previsibilidade;
- facilidade de auditoria.

---

# ADR-037 — Filosofia de Desenvolvimento

## Status

Aprovada

## Decisão

O desenvolvimento do Dashboard Economização seguirá obrigatoriamente a seguinte sequência:

Documentação

↓

Decisão Técnica

↓

Implementação

↓

Testes

↓

Auditoria

↓

Validação Humana

↓

Commit

↓

Push

Nenhuma funcionalidade deverá ser implementada diretamente sem passar pelas etapas anteriores, salvo pequenas correções emergenciais devidamente registradas.

Este fluxo passa a ser considerado padrão oficial de desenvolvimento do projeto.

---

# ADR-038 — Gerenciador de Pacotes

## Status

Aprovada

## Contexto

O Dashboard Economização é um monorepositório com múltiplos workspaces (`frontend`, futuros `backend`, `worker` e `packages`). A fundação do repositório já utiliza `pnpm` (`packageManager` no `package.json` raiz e `pnpm-workspace.yaml`). O item "gerenciador de pacotes" constava como pendente neste documento e precisava de registro formal.

## Decisão

**pnpm** será o gerenciador oficial de pacotes do monorepositório.

Registrar:

- workspace simples via `pnpm-workspace.yaml`;
- lockfile único (`pnpm-lock.yaml`) como fonte de verdade das versões resolvidas;
- não utilizar npm, yarn ou bun no projeto sem nova decisão formal;
- scripts na raiz poderão orquestrar os workspaces.

## Alternativas avaliadas

- npm workspaces;
- yarn;
- bun.

## Motivos

- eficiência de instalação;
- suporte nativo a workspaces;
- determinismo via lockfile;
- economia de disco;
- boa compatibilidade com a stack Node.js + TypeScript do projeto.

## Consequências

- toda instalação e script oficial deverá usar `pnpm`;
- o `pnpm-lock.yaml` deverá ser versionado;
- troca de gerenciador exigirá nova ADR.

---

# ADR-039 — Next.js App Router

## Status

Aprovada

## Contexto

A ADR-005 aprovou Next.js com TypeScript, sem definir o modelo de roteamento. O padrão de frontend da série 09 adotou App Router como organização da aplicação. Esta decisão precisa estar registrada formalmente para não permanecer apenas nos padrões de desenvolvimento.

## Decisão

O frontend utilizará **Next.js App Router**.

Pages Router não será utilizado para novas funcionalidades do projeto.

## Motivos

- arquitetura atual do Next.js;
- layouts aninhados;
- fronteiras server/client explícitas;
- organização moderna da aplicação alinhada ao documento `docs/09.4-frontend.md`.

## Consequências

- novas rotas e páginas deverão ser criadas sob a convenção App Router;
- migração eventualmente necessária de qualquer artefato legado de Pages Router deverá ser explícita e justificada;
- alteração desta decisão exigirá nova ADR.

---

# ADR-040 — Node.js 24 LTS

## Status

Aprovada

## Contexto

O runtime Node.js precisa ser homogêneo entre desenvolvimento, CI e produção. O repositório já declara a major 24 em `.nvmrc`, `.node-version` e no campo `engines` do `package.json` raiz. O item "versão mínima de Node.js" constava como pendente neste documento.

## Decisão

**Node.js 24 LTS** será o runtime oficial inicial do projeto.

Registrar:

- `.nvmrc` com major `24`;
- `.node-version` com major `24`;
- `engines.node` compatível com a linha 24 LTS;
- uso obrigatório em desenvolvimento;
- uso obrigatório em produção;
- base dos containers futuros.

## Motivos

- linha LTS estável;
- alinhamento com a fundação já estabelecida do repositório;
- redução de avisos de engine e de divergência entre ambientes.

## Consequências

- ambientes locais e de deploy deverão utilizar Node.js 24 LTS;
- atualização de major (25+) deverá exigir decisão explícita, validação de dependências e nova ADR;
- patches e minors dentro da linha 24 poderão ser adotados sem nova ADR, desde que compatíveis com `engines`.

---

# ADR-051 — Runtime híbrido do Ambiente Piloto Felipe

## Status

Aprovada (piloto; não substitui a Fase 19 completa)

## Contexto

A ADR-003 prevê Docker Compose de toda a aplicação. O repositório só empacota PostgreSQL e Redis. Não há Dockerfiles de Next/API/worker. O piloto Felipe precisa subir agora, numa VPS única.

## Decisão

No Ambiente Piloto Felipe:

- PostgreSQL e Redis continuam no `compose.yaml` atual, bind `127.0.0.1`, volumes persistentes, `restart: unless-stopped`;
- API, worker e Next.js rodam via systemd no host (usuário `dashboard`);
- Nginx no host, same-origin, TLS Let’s Encrypt quando houver domínio;
- ponto de entrada operacional: `install.sh` (wizard idempotente).

Dockerfiles da aplicação e Compose completo permanecem na Fase 19 / evolução da ADR-003, sem bloquear o piloto.

---

# ADR-052 — ALLOW_INSECURE_HTTP_SESSION (modo IP temporário)

## Status

Aprovada

## Contexto

`NODE_ENV=production` define cookie de sessão `Secure`. HTTP puro + cookie Secure impede o login. A ADR-014 permite acesso inicial por IP/HTTP. O código não acompanhava essa ADR.

## Decisão

Não usar `NODE_ENV=development` no piloto.

Flag explícita `ALLOW_INSECURE_HTTP_SESSION`:

- default ausente/false (seguro);
- só produz efeito em `production` com `APP_URL` `http://`;
- `APP_URL` `https://` ignora/recusa a flag (cookie continua Secure);
- warning no boot da API;
- o instalador desativa a flag ao emitir SSL.

---

# ADR-053 — Bootstrap do primeiro SUPER_ADMIN

## Status

Aprovada (corrigida em PILOT-INFRA-1.1)

## Contexto

`POST /admin/administrators` cria `ADMIN` e exige sessão ADMIN/SUPER_ADMIN. Não há seed Prisma. Banco vazio impede o primeiro login. `SUPER_ADMIN` só surge por fluxo técnico/ops (`docs/15` §5.7, `docs/16`).

A primeira conta da instalação é o operador técnico da plataforma, não o administrador operacional do produto.

## Decisão

Comando oficial:

`pnpm --filter @dashboard-economizacao/backend bootstrap:super-admin`

- cria somente um `SUPER_ADMIN` ACTIVE, `tenantId = null`, com hasher Argon2id oficial;
- senha via stdin, sem eco; recusa `--password` em argv (não deve ir para o histórico do shell);
- não lê senha de arquivo, de `install.sh` nem de variável de ambiente;
- recusa senha fora da política (10–128) e e-mail inválido;
- normaliza nome/e-mail pelos mecanismos oficiais de auth;
- idempotente **somente** se já existir `SUPER_ADMIN`;
- a existência de `ADMIN` sem `SUPER_ADMIN` **não** bloqueia o bootstrap;
- não cria `ADMIN`, tenant, empresa nem conta default/hardcoded.

Não há alias `bootstrap:admin`: esse nome representaria conceitualmente o `SUPER_ADMIN` e foi removido.

O `install.sh` conduz esse comando na primeira instalação (“Configuração do Super Administrador da Plataforma”). O `ADMIN` operacional (Felipe, no piloto) permanece para fluxo posterior da plataforma.


