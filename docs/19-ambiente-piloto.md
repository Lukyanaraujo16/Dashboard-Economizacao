# Dashboard Economização

# 19 — Ambiente Piloto Felipe (instalação operacional)

Status: Em implementação (não homologado em VPS)  
Projeto: Dashboard Economização  
Tipo: Guia operacional do piloto  
Não substitui a Fase 19 completa do roadmap.

---

## 1. Objetivo

Preparar a instalação do **Ambiente Piloto Felipe** em uma VPS única, com o estado homologado/publicado do produto, enquanto o desenvolvimento continua localmente.

Esta fase entrega o instalador guiado `install.sh`. Ela **não** conclui backup/restore validados, observabilidade SaaS nem a Fase 19 completa.

### Infraestrutura real já contratada

A máquina do piloto **já está contratada** e o acesso SSH foi validado pelo operador. Estes números descrevem o estado real da VPS; **não** são requisitos hardcoded do `install.sh` (o wizard continua detectando CPU, RAM e disco em runtime).

| Campo | Valor real do piloto |
|---|---|
| Plano | Cloud VPS Plus 6 |
| Sistema | Ubuntu 24.04 LTS |
| Arquitetura | x86_64 |
| vCPU | 6 |
| RAM | 12 GB |
| Disco | 300 GB NVMe |
| SSH | acesso já validado pelo operador |

Perfil mínimo/histórico de referência (auditoria **antes** da contratação): 4 vCPU / 8 GB RAM / 80 GB. Esse perfil **não** é a máquina real do piloto.

## 2. Arquitetura híbrida do piloto

| Componente | Como roda |
|---|---|
| PostgreSQL 17.10 | Docker Compose (`compose.yaml` na raiz) |
| Redis 7.4.2 (AOF) | Docker Compose |
| API Fastify | systemd `dashboard-economizacao-api` — `127.0.0.1:3001` |
| Worker + scheduler BullMQ | systemd `dashboard-economizacao-worker` — `node dist/worker.js` |
| Frontend Next.js | systemd `dashboard-economizacao-web` — `127.0.0.1:3000` |
| Nginx | host — same-origin, HTTPS quando houver domínio |

Loopback interno. Portas 3000, 3001, 5432 e 6379 não são públicas.

## 3. Diretórios

| Caminho | Conteúdo |
|---|---|
| `/opt/dashboard-economizacao` | clone Git (código) |
| `/etc/dashboard-economizacao/app.env` | segredos da API/worker |
| `/etc/dashboard-economizacao/web.env` | apenas `NODE_ENV` e `API_URL` (Next) |
| `/etc/dashboard-economizacao/install-state` | SHA, modo de acesso, SSL |
| `/var/lib/dashboard-economizacao/storage` | logos/favicons (`STORAGE_PATH`) |
| `/var/backups/dashboard-economizacao` | reservado; backup ainda não automatizado |

O `.env` da raiz do Git **não** é o arquivo de produção.

## 4. Wizard

```
sudo ./install.sh
```

Primeira execução (sem instalação detectada):

1. Nova instalação  
2. Configurar domínio / SSL  
3. Atualizar aplicação  
4. Verificar instalação  
5. Reparar serviços  
6. Sair  

Reexecução: menu de manutenção **somente** quando `install-state` contém `installed=true`. Se `app.env` já existe mas a instalação parou antes do Prisma/systemd (estado parcial da VPS), o wizard permanece em “Nova instalação” e **retoma** sem apagar volumes, repo ou segredos.

Idempotente: não executa `docker compose down -v`, não sobrescreve `AUTH_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, `POSTGRES_PASSWORD` nem Client ID/Secret já persistidos. Credenciais Conta Azul só entram pelo wizard explícito.

Clone Git interrompido (sem env) **não** conta como instalação concluída: o wizard repara ownership de `/opt/dashboard-economizacao` para `dashboard:dashboard` e continua. Não apaga o diretório se o conteúdo não for um clone Git reconhecido.

O clone/fetch/checkout e o build Node (incluindo `prisma generate` / `migrate deploy`) rodam como o usuário `dashboard`. `/opt` permanece root.

Permissões canônicas de runtime (determinísticas; não dependem de umask):

| Caminho | Owner | Group | Mode |
|---|---|---|---|
| `/etc/dashboard-economizacao` | root | dashboard | `0750` |
| `/etc/dashboard-economizacao/app.env` | root | dashboard | `0640` |
| `/etc/dashboard-economizacao/web.env` | root | dashboard | `0640` |

`0640` + grupo `dashboard` permite que API/worker/web/Prisma leiam o env. Owner permanece `root`. Segredos não são world-readable (`644`/`777` são proibidos). Reexecução corrige owner/group/mode de `app.env` sem regenerar valores.

Docker Compose (`up`/`ps`) usa `--env-file` de `app.env` explicitamente. Containers Postgres/Redis já existentes são reutilizados (`up -d` idempotente); volumes não são destruídos.

Não se usa `git config safe.directory`.

O instalador clona o **remote Git no SHA informado**. Não copia working tree local (evita WIP ledger).

SHA de referência do piloto inicial (não é versão eterna):

`fc7f13ab1314123b34844f70be3fc7fb14d014b3`

## 5. Modo domínio / HTTPS

Recomendado. DNS deve apontar para o IPv4 da VPS antes do Certbot. Se o DNS ainda não apontar, a instalação HTTP pode seguir e o SSL ser emitido depois pelo mesmo `install.sh`.

`APP_URL=https://<domínio>`  
`CONTA_AZUL_REDIRECT_URI` é derivada: `<APP_URL>/integrations/conta-azul/callback`  
Exige App de Produção no portal Conta Azul (`docs/04`).

## 6. Modo IP temporário

`NODE_ENV=production` define cookie `Secure`. HTTP puro **quebra o login**.

Solução explícita: `ALLOW_INSECURE_HTTP_SESSION=true` somente com `APP_URL` `http://`. HTTPS recusa/ignora a flag. Default `false`. Warning no boot da API. O instalador desliga a flag ao emitir SSL.

Não usar `NODE_ENV=development` no piloto para contornar o cookie.

## 7. Bootstrap do primeiro SUPER_ADMIN

Não há seed Prisma. `POST /admin/administrators` cria `ADMIN` e exige sessão de plataforma já autenticada.

A primeira instalação cria **somente** o `SUPER_ADMIN` (operador técnico da plataforma, sem tenant). Não cria `ADMIN`, tenant nem empresa.

```
pnpm --filter @dashboard-economizacao/backend bootstrap:super-admin
```

O wizard chama esse comando na primeira instalação, com o título “Configuração do Super Administrador da Plataforma”. Senha via stdin (sem eco; não vai para argv nem para o histórico do shell). Idempotente **somente** se já existir `SUPER_ADMIN`. A existência de `ADMIN` sem `SUPER_ADMIN` **não** bloqueia o bootstrap.

Ao finalizar: `SUPER_ADMIN: configurado`.

O `ADMIN` operacional (Felipe, no piloto) não é criado nesta etapa.

## 8. trustProxy

Com `HOST=127.0.0.1`, o Fastify confia em `X-Forwarded-*` apenas de `127.0.0.1`/`::1` (Nginx local). Bind público não habilita trust proxy.

## 9. Update

O menu “Atualizar aplicação” faz checkout do SHA, `pnpm install --frozen-lockfile`, `prisma generate`, `migrate deploy`, build e restart.

**Não** há backup automático nesta fase. O instalador avisa e pede confirmação.

## 10. O que isto não é

- Não é a Fase 19 completa (`docs/06-roadmap.md`).  
- Não homologa o piloto até existir execução real em VPS.  
- Não implementa `backup.sh` / `restore.sh`.  
- Não inclui WIP ledger/`20260820040000_financial_transactions_ledger`.
