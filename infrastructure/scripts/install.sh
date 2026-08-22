#!/usr/bin/env bash
# Dashboard Economização — instalador guiado (PILOT-INFRA-1)
# Uso: sudo ./install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "${SCRIPT_DIR}/lib/install-lib.sh"

if [[ -d "${SCRIPT_DIR}/../../.git" || -f "${SCRIPT_DIR}/../../package.json" ]]; then
  REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
else
  REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
fi

INFRA_DIR="${REPO_ROOT}/infrastructure"
RECOMMENDED_SHA="fc7f13ab1314123b34844f70be3fc7fb14d014b3"
DEFAULT_REMOTE="https://github.com/Lukyanaraujo16/Dashboard-Economizacao.git"

DE_ROOT_PREFIX="${DE_ROOT_PREFIX:-}"
DE_DRY_RUN="${DE_DRY_RUN:-0}"
DE_ASSUME_YES="${DE_ASSUME_YES:-0}"
SERVICE_USER="dashboard"
SERVICE_GROUP="dashboard"

init_paths() {
  APP_HOME="${DE_ROOT_PREFIX}/opt/dashboard-economizacao"
  ETC_DIR="${DE_ROOT_PREFIX}/etc/dashboard-economizacao"
  STORAGE_DIR="${DE_ROOT_PREFIX}/var/lib/dashboard-economizacao/storage"
  BACKUP_DIR="${DE_ROOT_PREFIX}/var/backups/dashboard-economizacao"
  NGINX_AVAILABLE="${DE_ROOT_PREFIX}/etc/nginx/sites-available/dashboard-economizacao"
  NGINX_ENABLED="${DE_ROOT_PREFIX}/etc/nginx/sites-enabled/dashboard-economizacao"
  SYSTEMD_DIR="${DE_ROOT_PREFIX}/etc/systemd/system"
  APP_ENV_FILE="${ETC_DIR}/app.env"
  WEB_ENV_FILE="${ETC_DIR}/web.env"
  STATE_FILE="${ETC_DIR}/install-state"
}

run_cmd() {
  if [[ "$DE_DRY_RUN" == "1" ]]; then
    de_log "[dry-run] $*"
    return 0
  fi
  "$@"
}

need_root() {
  if [[ "${DE_ALLOW_NONROOT:-0}" == "1" ]]; then
    return 0
  fi
  if [[ "$(id -u)" -ne 0 ]]; then
    de_err "Execute como root: sudo ./install.sh"
    exit 1
  fi
}

prompt() {
  local message="$1"
  local default="${2:-}"
  local reply=""
  if [[ "$DE_ASSUME_YES" == "1" && -n "$default" ]]; then
    printf '%s\n' "$default"
    return
  fi
  if [[ -n "$default" ]]; then
    read -r -p "${message} [${default}]: " reply || true
    printf '%s\n' "${reply:-$default}"
  else
    read -r -p "${message}: " reply || true
    printf '%s\n' "$reply"
  fi
}

prompt_secret() {
  local message="$1"
  local reply=""
  if [[ ! -t 0 ]]; then
    read -r reply || true
    printf '%s\n' "$reply"
    return
  fi
  read -r -s -p "${message}: " reply || true
  printf '\n' >&2
  printf '%s\n' "$reply"
}

confirm() {
  local message="$1"
  local answer
  answer="$(prompt "$message" "S")"
  de_yes_default "$answer"
}

detect_public_ip() {
  local ip=""
  ip="$(curl -4 -fsS --max-time 3 https://api.ipify.org 2>/dev/null || true)"
  if de_is_ipv4 "$ip"; then
    printf '%s\n' "$ip"
    return 0
  fi
  ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  printf '%s\n' "${ip:-}"
  return 0
}

detect_local_ip() {
  local ip=""
  ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  printf '%s\n' "${ip:-}"
  return 0
}

print_detection() {
  de_log ""
  de_log "Dashboard Economização — Instalador"
  de_log "==================================="
  de_log ""
  de_log "Servidor detectado:"
  de_log "  SO:           ${DETECT_OS}"
  de_log "  Arquitetura:  ${DETECT_ARCH}"
  de_log "  Hostname:     ${DETECT_HOSTNAME}"
  de_log "  IP público:   ${DETECT_PUBLIC_IP:-não detectado}"
  de_log "  IP local:     ${DETECT_LOCAL_IP:-não detectado}"
  de_log "  vCPU:         ${DETECT_CPUS}"
  de_log "  RAM:          ${DETECT_RAM_GB} GB"
  de_log "  Disco livre:  ${DETECT_DISK_GB} GB"
  de_log "  Docker:       ${DETECT_DOCKER}"
  de_log "  Compose:      ${DETECT_COMPOSE}"
  de_log "  Node:         ${DETECT_NODE}"
  de_log "  pnpm:         ${DETECT_PNPM}"
  de_log "  Git:          ${DETECT_GIT}"
  de_log "  Nginx:        ${DETECT_NGINX}"
  de_log "  Certbot:      ${DETECT_CERTBOT}"
  de_log "  UFW:          ${DETECT_UFW}"
  de_log "  Instalação:   ${DETECT_INSTALL}"
  de_log ""
}

run_detection() {
  DETECT_OS="$(de_detect_os_pretty)"
  DETECT_ARCH="$(de_detect_arch)"
  DETECT_HOSTNAME="$(hostname 2>/dev/null || printf unknown)"
  DETECT_PUBLIC_IP="$(detect_public_ip)"
  DETECT_LOCAL_IP="$(detect_local_ip)"
  DETECT_CPUS="$(de_detect_cpus)"
  DETECT_RAM_GB="$(de_detect_ram_gb)"
  DETECT_DISK_GB="$(de_detect_disk_gb)"
  DETECT_DOCKER="ausente"
  if de_cmd_exists docker; then
    DETECT_DOCKER="$(docker --version 2>/dev/null | head -n1 || printf presente)"
  fi
  DETECT_COMPOSE="ausente"
  if de_cmd_exists docker && docker compose version >/dev/null 2>&1; then
    DETECT_COMPOSE="$(docker compose version 2>/dev/null | head -n1 || printf presente)"
  fi
  DETECT_NODE="ausente"
  if de_cmd_exists node; then
    DETECT_NODE="$(node --version 2>/dev/null || printf presente)"
  fi
  DETECT_PNPM="ausente"
  if de_cmd_exists pnpm; then
    DETECT_PNPM="$(pnpm --version 2>/dev/null || printf presente)"
  fi
  DETECT_GIT="ausente"
  if de_cmd_exists git; then
    DETECT_GIT="$(git --version 2>/dev/null || printf presente)"
  fi
  DETECT_NGINX="ausente"
  if de_cmd_exists nginx; then
    DETECT_NGINX="$(nginx -v 2>&1 || printf presente)"
  fi
  DETECT_CERTBOT="ausente"
  if de_cmd_exists certbot; then
    DETECT_CERTBOT="$(certbot --version 2>/dev/null | head -n1 || printf presente)"
  fi
  DETECT_UFW="ausente"
  if de_cmd_exists ufw; then
    DETECT_UFW="presente"
  fi
  if is_complete_install; then
    DETECT_INSTALL="existente (${STATE_FILE})"
  elif is_partial_install; then
    DETECT_INSTALL="parcial (retomável; Prisma/serviços ainda não concluídos)"
  else
    DETECT_INSTALL="nenhuma"
  fi
}

# Instalação concluída só quando o wizard gravou installed=true.
# app.env existente (VPS parcial) NÃO abre o menu de manutenção.
is_complete_install() {
  [[ "$(de_read_state "$STATE_FILE" "installed" || true)" == "true" ]]
}

is_partial_install() {
  if is_complete_install; then
    return 1
  fi
  [[ -f "$APP_ENV_FILE" || -f "$STATE_FILE" || -d "${APP_HOME}/.git" ]]
}

# Política canônica: dir 0750 root:dashboard; app.env/web.env 0640 root:dashboard.
# Repara owner/group/mode sem reescrever o conteúdo. Não usa umask.
secure_runtime_env_files() {
  mkdir -p "$ETC_DIR"
  chmod 0750 "$ETC_DIR" 2>/dev/null || true
  if [[ "${DE_ALLOW_NONROOT:-0}" != "1" ]] && de_is_root; then
    chown "root:${SERVICE_GROUP}" "$ETC_DIR"
  fi
  if [[ -f "$APP_ENV_FILE" ]]; then
    de_apply_secret_file_perms "$APP_ENV_FILE" root "$SERVICE_GROUP" 640
  fi
  if [[ -f "$WEB_ENV_FILE" ]]; then
    de_apply_secret_file_perms "$WEB_ENV_FILE" root "$SERVICE_GROUP" 640
  fi
}

ensure_dirs() {
  mkdir -p "$(dirname "$APP_HOME")" "$ETC_DIR" "$STORAGE_DIR" "$BACKUP_DIR" \
    "$(dirname "$NGINX_AVAILABLE")" "$(dirname "$NGINX_ENABLED")" "$SYSTEMD_DIR"
  chmod 0750 "$ETC_DIR" "$STORAGE_DIR" "$BACKUP_DIR" 2>/dev/null || true
}

install_system_packages() {
  if [[ "$DE_DRY_RUN" == "1" ]]; then
    de_log "[dry-run] apt-get install ca-certificates curl git build-essential nginx certbot python3-certbot-nginx ufw"
    return
  fi
  if ! de_cmd_exists apt-get; then
    de_err "Este instalador espera Ubuntu/Debian com apt-get."
    exit 1
  fi
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl git build-essential gnupg lsb-release \
    nginx certbot python3-certbot-nginx ufw python3 openssl
  if ! de_cmd_exists docker; then
    curl -fsSL https://get.docker.com | sh
  fi
  systemctl enable --now docker
  if ! de_cmd_exists node; then
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
    apt-get install -y nodejs
  fi
  if ! de_cmd_exists pnpm; then
    corepack enable
    corepack prepare pnpm@11.21.0 --activate
  fi
}

ensure_service_user() {
  if [[ "$DE_DRY_RUN" == "1" || "${DE_ALLOW_NONROOT:-0}" == "1" ]]; then
    return
  fi
  if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --system --home "$APP_HOME" --shell /usr/sbin/nologin "$SERVICE_USER"
  fi
  mkdir -p "$STORAGE_DIR"
  de_chown_tree "${SERVICE_USER}:${SERVICE_GROUP}" "$STORAGE_DIR"
  chown root:"$SERVICE_GROUP" "$ETC_DIR"
  chmod 0750 "$ETC_DIR"
  secure_runtime_env_files
}

# Git do repositório operacional sempre como o usuário da aplicação (não root).
git_as_app() {
  de_git_in_repo "$SERVICE_USER" "$APP_HOME" "$@"
}

prepare_app_home() {
  mkdir -p "$(dirname "$APP_HOME")"
  if [[ ! -d "$APP_HOME" ]]; then
    mkdir -p "$APP_HOME"
  fi
  de_chown_tree "${SERVICE_USER}:${SERVICE_GROUP}" "$APP_HOME"
}

# Clone interrompido: raiz dashboard + conteúdo root. Repara só o working tree Git.
# Não apaga o diretório. Não toca /etc (segredos).
repair_app_home_ownership() {
  [[ -d "$APP_HOME" ]] || return 0
  de_log "Ajustando ownership de ${APP_HOME} para ${SERVICE_USER}:${SERVICE_GROUP}"
  de_chown_tree "${SERVICE_USER}:${SERVICE_GROUP}" "$APP_HOME"
}

sync_application_code() {
  local sha="$1"
  local remote="$2"
  if [[ "$DE_DRY_RUN" == "1" ]]; then
    de_log "[dry-run] git clone/checkout como ${SERVICE_USER}: ${remote} @ ${sha} → ${APP_HOME}"
    de_write_state "$STATE_FILE" "sha" "$sha"
    return
  fi

  prepare_app_home

  if [[ ! -d "${APP_HOME}/.git" ]]; then
    if [[ -d "${APP_HOME}" && -n "$(ls -A "$APP_HOME" 2>/dev/null || true)" ]]; then
      de_err "Diretório ${APP_HOME} existe e não é um clone Git. Abortando para não destruir dados."
      exit 1
    fi
    de_run_as_user "$SERVICE_USER" env HOME="$APP_HOME" PATH="${PATH:-/usr/bin:/bin}" \
      git clone "$remote" "$APP_HOME"
    de_chown_tree "${SERVICE_USER}:${SERVICE_GROUP}" "$APP_HOME"
  else
    repair_app_home_ownership
    local origin_url=""
    origin_url="$(git_as_app remote get-url origin 2>/dev/null || true)"
    if [[ -n "$origin_url" && "$origin_url" != "$remote" ]]; then
      de_err "Remote origin em ${APP_HOME} é ${origin_url}, diferente do informado (${remote}). Abortando."
      exit 1
    fi
  fi

  git_as_app fetch --all --tags
  git_as_app checkout --detach "$sha"
  de_write_state "$STATE_FILE" "sha" "$(git_as_app rev-parse HEAD)"
  de_write_state "$STATE_FILE" "remote" "$remote"
}

write_runtime_env() {
  local app_url="$1"
  local access_mode="$2"
  local allow_insecure="$3"
  local ca_id="$4"
  local ca_secret="$5"
  local interval="$6"

  ensure_dirs
  secure_runtime_env_files
  de_env_upsert "$APP_ENV_FILE" "NODE_ENV" "production" 0
  de_env_upsert "$APP_ENV_FILE" "HOST" "127.0.0.1" 0
  de_env_upsert "$APP_ENV_FILE" "PORT" "3001" 0
  de_env_upsert "$APP_ENV_FILE" "API_URL" "http://127.0.0.1:3001" 0
  de_env_upsert "$APP_ENV_FILE" "APP_URL" "$app_url" 0
  de_env_upsert "$APP_ENV_FILE" "STORAGE_PROVIDER" "local" 0
  de_env_upsert "$APP_ENV_FILE" "STORAGE_PATH" "$STORAGE_DIR" 0
  de_env_upsert "$APP_ENV_FILE" "POSTGRES_DB" "dashboard_economizacao" 1
  de_env_upsert "$APP_ENV_FILE" "POSTGRES_USER" "dashboard" 1
  de_env_upsert "$APP_ENV_FILE" "POSTGRES_PORT" "5432" 1
  de_env_upsert "$APP_ENV_FILE" "REDIS_PORT" "6379" 1
  de_env_upsert "$APP_ENV_FILE" "REDIS_URL" "redis://127.0.0.1:6379" 0
  de_env_upsert "$APP_ENV_FILE" "CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES" "$interval" 0
  de_env_upsert "$APP_ENV_FILE" "CONTA_AZUL_REDIRECT_URI" "$(de_conta_azul_redirect_uri "$app_url")" 0
  de_env_upsert "$APP_ENV_FILE" "ALLOW_INSECURE_HTTP_SESSION" "$allow_insecure" 0

  local auth_secret enc_key pg_pass
  auth_secret="$(openssl rand -hex 32)"
  enc_key="$(openssl rand -hex 32)"
  pg_pass="$(openssl rand -hex 16)"
  de_env_upsert "$APP_ENV_FILE" "AUTH_SECRET" "$auth_secret" 1
  de_env_upsert "$APP_ENV_FILE" "INTEGRATION_ENCRYPTION_KEY" "$enc_key" 1
  de_env_upsert "$APP_ENV_FILE" "POSTGRES_PASSWORD" "$pg_pass" 1

  pg_pass="$(de_env_get "$APP_ENV_FILE" "POSTGRES_PASSWORD")"
  local pg_user pg_db pg_port
  pg_user="$(de_env_get "$APP_ENV_FILE" "POSTGRES_USER")"
  pg_db="$(de_env_get "$APP_ENV_FILE" "POSTGRES_DB")"
  pg_port="$(de_env_get "$APP_ENV_FILE" "POSTGRES_PORT")"
  de_env_upsert "$APP_ENV_FILE" "DATABASE_URL" "postgresql://${pg_user}:${pg_pass}@127.0.0.1:${pg_port}/${pg_db}" 0

  if [[ -n "$ca_id" && -n "$ca_secret" ]]; then
    de_env_upsert "$APP_ENV_FILE" "CONTA_AZUL_CLIENT_ID" "$ca_id" 1
    de_env_upsert "$APP_ENV_FILE" "CONTA_AZUL_CLIENT_SECRET" "$ca_secret" 1
  fi

  de_env_upsert "$WEB_ENV_FILE" "NODE_ENV" "production" 0
  de_env_upsert "$WEB_ENV_FILE" "API_URL" "http://127.0.0.1:3001" 0
  secure_runtime_env_files

  de_write_state "$STATE_FILE" "access_mode" "$access_mode"
  de_write_state "$STATE_FILE" "app_url" "$app_url"
  de_write_state "$STATE_FILE" "allow_insecure_http_session" "$allow_insecure"
  de_write_state "$STATE_FILE" "backup_configured" "false"
}

render_proxy_snippets() {
  mkdir -p "$ETC_DIR"
  cp "${INFRA_DIR}/nginx/proxy-backend.conf" "${ETC_DIR}/proxy-backend.conf"
  cp "${INFRA_DIR}/nginx/proxy-frontend.conf" "${ETC_DIR}/proxy-frontend.conf"
}

render_nginx_http() {
  local server_name="$1"
  render_proxy_snippets
  de_render_template \
    "${INFRA_DIR}/nginx/site-http.conf.template" \
    "$NGINX_AVAILABLE" \
    "__SERVER_NAME__=${server_name}" \
    "__LISTEN_PORT__=80" \
    "__ETC_DIR__=${ETC_DIR}"
  mkdir -p "$(dirname "$NGINX_ENABLED")"
  ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"
}

render_systemd_units() {
  local node_bin
  node_bin="$(command -v node || printf /usr/bin/node)"
  local replacements=(
    "__SERVICE_USER__=${SERVICE_USER}"
    "__SERVICE_GROUP__=${SERVICE_GROUP}"
    "__APP_HOME__=${APP_HOME}"
    "__APP_ENV_FILE__=${APP_ENV_FILE}"
    "__WEB_ENV_FILE__=${WEB_ENV_FILE}"
    "__NODE_BIN__=${node_bin}"
  )
  de_render_template "${INFRA_DIR}/systemd/dashboard-economizacao-api.service.template" \
    "${SYSTEMD_DIR}/dashboard-economizacao-api.service" "${replacements[@]}"
  de_render_template "${INFRA_DIR}/systemd/dashboard-economizacao-worker.service.template" \
    "${SYSTEMD_DIR}/dashboard-economizacao-worker.service" "${replacements[@]}"
  de_render_template "${INFRA_DIR}/systemd/dashboard-economizacao-web.service.template" \
    "${SYSTEMD_DIR}/dashboard-economizacao-web.service" "${replacements[@]}"
}

# Compose sempre com --env-file do app.env. Não depende do env interativo do operador.
compose_app() {
  docker compose --project-directory "$APP_HOME" --env-file "$APP_ENV_FILE" \
    -f "${APP_HOME}/compose.yaml" "$@"
}

start_postgres_redis() {
  secure_runtime_env_files
  if [[ "$DE_DRY_RUN" == "1" ]]; then
    de_log "[dry-run] docker compose --env-file ${APP_ENV_FILE} up -d postgres redis"
    return
  fi
  compose_app up -d postgres redis
  local i
  for i in $(seq 1 30); do
    if compose_app ps | grep -q healthy; then
      return 0
    fi
    sleep 2
  done
  de_warn "Healthcheck do Compose ainda não está healthy; verifique docker compose ps."
}

build_application() {
  secure_runtime_env_files
  if [[ "$DE_DRY_RUN" == "1" ]]; then
    de_log "[dry-run] pnpm install --frozen-lockfile && prisma generate && migrate deploy && build (como ${SERVICE_USER})"
    return
  fi
  de_run_as_user "$SERVICE_USER" env HOME="$APP_HOME" PATH="${PATH:-/usr/bin:/bin}" \
    bash --noprofile --norc -c 'set -euo pipefail; cd "$HOME" && pnpm install --frozen-lockfile'
  de_run_as_user "$SERVICE_USER" \
    env HOME="$APP_HOME" PATH="${PATH:-/usr/bin:/bin}" DE_APP_ENV="$APP_ENV_FILE" \
    bash --noprofile --norc -c 'set -euo pipefail
set -a
. "$DE_APP_ENV"
set +a
cd "$HOME/backend"
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm build'
  de_run_as_user "$SERVICE_USER" env HOME="$APP_HOME" PATH="${PATH:-/usr/bin:/bin}" \
    bash --noprofile --norc -c 'set -euo pipefail; cd "$HOME/frontend" && pnpm build'
}

enable_services() {
  if [[ "$DE_DRY_RUN" == "1" ]]; then
    de_log "[dry-run] systemctl enable --now api worker web nginx"
    return
  fi
  systemctl daemon-reload
  systemctl enable --now dashboard-economizacao-api.service
  systemctl enable --now dashboard-economizacao-web.service
  if de_env_has_nonempty "$APP_ENV_FILE" "CONTA_AZUL_CLIENT_ID"; then
    systemctl enable --now dashboard-economizacao-worker.service
  else
    de_warn "Conta Azul não configurada: worker criado, mas não iniciado."
    systemctl enable dashboard-economizacao-worker.service || true
  fi
  systemctl enable --now nginx
}

configure_firewall() {
  if [[ "$DE_DRY_RUN" == "1" ]]; then
    de_log "[dry-run] ufw allow OpenSSH 80 443 && ufw --force enable"
    return
  fi
  if ! de_cmd_exists ufw; then
    de_warn "UFW ausente; firewall não configurado."
    return
  fi
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  if confirm "Habilitar UFW agora? SSH (22), HTTP (80) e HTTPS (443) serão permitidos"; then
    ufw --force enable
  else
    de_warn "UFW não foi habilitado."
  fi
}

bootstrap_super_admin() {
  de_log ""
  de_log "Configuração do Super Administrador da Plataforma"
  de_log "Esta conta possui acesso técnico e administrativo de nível máximo"
  de_log "à plataforma."
  de_log ""
  if [[ "$DE_DRY_RUN" == "1" ]]; then
    de_log "[dry-run] bootstrap:super-admin"
    de_log "SUPER_ADMIN: configurado"
    return
  fi
  if ! confirm "Configurar o Super Administrador agora?"; then
    de_warn "Bootstrap de SUPER_ADMIN adiado. Execute depois: pnpm --filter @dashboard-economizacao/backend bootstrap:super-admin"
    de_write_state "$STATE_FILE" "super_admin" "pendente"
    return
  fi
  local name email pass pass2
  name="$(prompt "Nome" "")"
  email="$(prompt "E-mail" "")"
  pass="$(prompt_secret "Senha (mínimo 10 caracteres)")"
  pass2="$(prompt_secret "Confirme a senha")"
  if [[ "$pass" != "$pass2" ]]; then
    de_err "Senhas não conferem."
    pass=""
    pass2=""
    return 1
  fi
  if printf '%s\n' "$pass" | sudo -u "$SERVICE_USER" env DASHBOARD_ENV_FILE="$APP_ENV_FILE" \
    bash -lc "cd '${APP_HOME}/backend' && node dist/ops/bootstrap-super-admin.js --name $(printf '%q' "$name") --email $(printf '%q' "$email")"; then
    de_write_state "$STATE_FILE" "super_admin" "configurado"
    de_log "SUPER_ADMIN: configurado"
  else
    de_write_state "$STATE_FILE" "super_admin" "pendente"
    de_err "Falha no bootstrap de SUPER_ADMIN."
    pass=""
    pass2=""
    return 1
  fi
  pass=""
  pass2=""
}

health_check() {
  local app_url
  app_url="$(de_read_state "$STATE_FILE" "app_url" || true)"
  local ok_api="FALHA" ok_db="FALHA" ok_redis="FALHA" ok_web="FALHA" ok_worker="N/A" ok_ssl="N/A"
  if curl -fsS --max-time 5 http://127.0.0.1:3001/health >/dev/null; then ok_api="OK"; fi
  if curl -fsS --max-time 5 http://127.0.0.1:3001/health/db >/dev/null; then ok_db="OK"; fi
  if curl -fsS --max-time 5 http://127.0.0.1:3001/health/redis >/dev/null; then ok_redis="OK"; fi
  if curl -fsS --max-time 5 http://127.0.0.1:3000/login >/dev/null; then ok_web="OK"; fi
  if [[ "$DE_DRY_RUN" != "1" ]] && systemctl is-active --quiet dashboard-economizacao-worker.service 2>/dev/null; then
    ok_worker="OK"
  elif [[ "$DE_DRY_RUN" == "1" ]]; then
    ok_worker="dry-run"
    ok_api="dry-run"
    ok_db="dry-run"
    ok_redis="dry-run"
    ok_web="dry-run"
  fi
  if [[ "${app_url}" == https://* ]]; then
    if curl -fsS --max-time 8 "${app_url}/login" >/dev/null; then ok_ssl="OK"; else ok_ssl="FALHA"; fi
  fi
  de_log ""
  de_log "INSTALAÇÃO — STATUS"
  de_log "URL:     ${app_url:-não definida}"
  de_log "API:     ${ok_api}"
  de_log "DATABASE:${ok_db}"
  de_log "REDIS:   ${ok_redis}"
  de_log "WORKER:  ${ok_worker}"
  de_log "SCHEDULER: mesmo processo do worker"
  de_log "WEB:     ${ok_web}"
  de_log "SSL:     ${ok_ssl}"
  de_log "BACKUP:  não configurado (backup.sh ainda não implementado)"
  local super_admin_state
  super_admin_state="$(de_read_state "$STATE_FILE" "super_admin" || true)"
  if [[ -z "$super_admin_state" ]]; then
    super_admin_state="pendente"
  fi
  de_log "SUPER_ADMIN: ${super_admin_state}"
  de_log ""
}

configure_ssl() {
  local domain email
  domain="$(prompt "Domínio/subdomínio" "")"
  if ! de_is_domain "$domain"; then
    de_err "Domínio inválido."
    return 1
  fi
  email="$(prompt "E-mail Let's Encrypt" "")"
  if ! de_is_email "$email"; then
    de_err "E-mail inválido."
    return 1
  fi
  local resolved
  resolved="$(getent ahostsv4 "$domain" 2>/dev/null | awk '{print $1; exit}' || true)"
  de_log "DNS de ${domain}: ${resolved:-sem resolução}"
  if [[ -n "${DETECT_PUBLIC_IP}" && "$resolved" != "${DETECT_PUBLIC_IP}" ]]; then
    de_warn "O DNS ainda não aponta para o IP desta VPS (${DETECT_PUBLIC_IP})."
    if ! confirm "Continuar SEM emitir certificado agora?"; then
      return 1
    fi
    render_nginx_http "$domain"
    if [[ "$DE_DRY_RUN" != "1" ]]; then
      nginx -t && systemctl reload nginx
    fi
    return 0
  fi
  render_nginx_http "$domain"
  if [[ "$DE_DRY_RUN" == "1" ]]; then
    de_log "[dry-run] certbot --nginx -d ${domain}"
  else
    nginx -t && systemctl reload nginx
    certbot --nginx -d "$domain" --non-interactive --agree-tos -m "$email" --redirect
  fi
  local app_url="https://${domain}"
  de_env_upsert "$APP_ENV_FILE" "APP_URL" "$app_url" 0
  de_env_upsert "$APP_ENV_FILE" "CONTA_AZUL_REDIRECT_URI" "$(de_conta_azul_redirect_uri "$app_url")" 0
  de_env_upsert "$APP_ENV_FILE" "ALLOW_INSECURE_HTTP_SESSION" "false" 0
  secure_runtime_env_files
  de_write_state "$STATE_FILE" "access_mode" "https"
  de_write_state "$STATE_FILE" "app_url" "$app_url"
  de_write_state "$STATE_FILE" "domain" "$domain"
  de_write_state "$STATE_FILE" "allow_insecure_http_session" "false"
  de_write_state "$STATE_FILE" "ssl_configured" "true"
  if [[ "$DE_DRY_RUN" != "1" ]]; then
    systemctl restart dashboard-economizacao-api.service dashboard-economizacao-web.service || true
    if systemctl is-enabled --quiet dashboard-economizacao-worker.service 2>/dev/null; then
      systemctl restart dashboard-economizacao-worker.service || true
    fi
  fi
  de_log "HTTPS configurado. Atualize a Redirect URI no portal Conta Azul:"
  de_log "  $(de_conta_azul_redirect_uri "$app_url")"
}

action_new_install() {
  de_log "Nova instalação — todos os componentes nesta VPS (loopback interno)."
  if ! confirm "Usar este servidor para frontend, backend, worker, Postgres e Redis"; then
    de_err "Arquitetura distribuída não é suportada neste instalador. Abortando."
    return 1
  fi
  local mode
  de_log ""
  de_log "Como deseja acessar o sistema?"
  de_log "  [1] Domínio com HTTPS (recomendado)"
  de_log "  [2] IP temporário (HTTP). Cookie Secure de production QUEBRA o login;"
  de_log "      o instalador ativará ALLOW_INSECURE_HTTP_SESSION=true só neste modo."
  mode="$(prompt "Opção" "1")"
  local app_url allow_insecure="false" access_mode="https" server_name=""
  if [[ "$mode" == "2" ]]; then
    local ip="${DETECT_PUBLIC_IP:-${DETECT_LOCAL_IP}}"
    ip="$(prompt "IPv4 público para APP_URL" "$ip")"
    if ! de_is_ipv4 "$ip"; then
      de_err "IPv4 inválido."
      return 1
    fi
    app_url="http://${ip}"
    allow_insecure="true"
    access_mode="ip"
    server_name="$ip"
    de_warn "Modo IP temporário: sessões HTTP sem cookie Secure. Não use como produção definitiva."
  else
    local domain
    domain="$(prompt "Domínio/subdomínio" "")"
    if ! de_is_domain "$domain"; then
      de_err "Domínio inválido."
      return 1
    fi
    app_url="https://${domain}"
    access_mode="https"
    server_name="$domain"
  fi

  local remote sha interval ca_id="" ca_secret=""
  remote="$(prompt "Remote Git" "$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || printf '%s' "$DEFAULT_REMOTE")")"
  de_log "SHA homologado de referência (não é versão eterna): ${RECOMMENDED_SHA}"
  sha="$(prompt "SHA/tag/branch para instalar" "$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || printf '%s' "$RECOMMENDED_SHA")")"
  interval="$(prompt "Intervalo da sync automática (minutos)" "60")"
  if de_env_has_nonempty "$APP_ENV_FILE" "CONTA_AZUL_CLIENT_ID" \
    && de_env_has_nonempty "$APP_ENV_FILE" "CONTA_AZUL_CLIENT_SECRET"; then
    de_log "Credenciais Conta Azul já constam em app.env e serão preservadas."
  elif confirm "Informar credenciais Conta Azul agora"; then
    ca_id="$(prompt "CONTA_AZUL_CLIENT_ID" "")"
    ca_secret="$(prompt_secret "Client Secret (entrada oculta; ao colar nada será exibido)")"
  else
    de_warn "Sem Conta Azul o worker de sync não inicia. A API/web sobem."
  fi

  install_system_packages
  ensure_dirs
  ensure_service_user
  sync_application_code "$sha" "$remote"
  write_runtime_env "$app_url" "$access_mode" "$allow_insecure" "$ca_id" "$ca_secret" "$interval"
  render_nginx_http "$server_name"
  render_systemd_units
  start_postgres_redis
  build_application
  enable_services
  configure_firewall
  if [[ "$access_mode" == "https" ]]; then
    configure_ssl || de_warn "SSL não concluído. Use o menu para emitir o certificado depois."
  fi
  bootstrap_super_admin || true
  de_write_state "$STATE_FILE" "installed" "true"
  health_check
}

action_verify() {
  run_detection
  print_detection
  health_check
}

action_restart() {
  if [[ "$DE_DRY_RUN" == "1" ]]; then
    de_log "[dry-run] restart services"
    return
  fi
  systemctl restart dashboard-economizacao-api.service dashboard-economizacao-web.service || true
  systemctl try-restart dashboard-economizacao-worker.service || true
  systemctl reload nginx || true
  health_check
}

action_repair() {
  secure_runtime_env_files
  render_systemd_units
  local server_name
  server_name="$(de_read_state "$STATE_FILE" "domain" || de_read_state "$STATE_FILE" "app_url" | sed -E 's#https?://##' || true)"
  if [[ -n "$server_name" ]]; then
    render_nginx_http "$server_name"
  fi
  if [[ "$DE_DRY_RUN" != "1" ]]; then
    systemctl daemon-reload
    nginx -t && systemctl reload nginx || true
  fi
  action_restart
}

action_update() {
  de_warn "Backup automático ainda NÃO existe. Faça dump manual do Postgres e cópia de ${STORAGE_DIR} antes."
  if ! confirm "Continuar atualização mesmo sem backup automatizado"; then
    return 1
  fi
  local sha
  sha="$(prompt "SHA/tag/branch de destino" "$(de_read_state "$STATE_FILE" "sha")")"
  local remote
  remote="$(de_read_state "$STATE_FILE" "remote" || git_as_app remote get-url origin)"
  secure_runtime_env_files
  sync_application_code "$sha" "$remote"
  build_application
  action_restart
}

print_first_menu() {
  if is_partial_install; then
    de_log "Instalação parcial detectada. A nova instalação retomará sem apagar volumes, repo ou segredos."
  else
    de_log "Nenhuma instalação detectada."
  fi
  de_log "  [1] Nova instalação   (padrão)"
  de_log "  [2] Configurar domínio / SSL"
  de_log "  [3] Atualizar aplicação"
  de_log "  [4] Verificar instalação"
  de_log "  [5] Reparar serviços"
  de_log "  [6] Sair"
}

print_maintenance_menu() {
  de_log "Instalação existente detectada."
  de_log "  [1] Verificar instalação"
  de_log "  [2] Configurar/alterar domínio"
  de_log "  [3] Emitir/reemitir certificado SSL"
  de_log "  [4] Atualizar aplicação"
  de_log "  [5] Reiniciar serviços"
  de_log "  [6] Mostrar status"
  de_log "  [7] Sair"
}

usage() {
  cat <<'EOF'
Dashboard Economização — install.sh

  sudo ./install.sh

Variáveis opcionais:
  DE_DRY_RUN=1            não altera o sistema (imprime ações)
  DE_ROOT_PREFIX=/tmp/x   prefixa caminhos (testes locais)
  DE_ALLOW_NONROOT=1      permite executar sem root (testes)
  DE_ASSUME_YES=1         aceita defaults
EOF
}

main() {
  case "${1:-}" in
    -h | --help) usage; exit 0 ;;
    --dry-run) DE_DRY_RUN=1; shift || true ;;
  esac
  init_paths
  need_root
  run_detection
  print_detection
  if [[ "${1:-}" == "--detect-only" ]]; then
    exit 0
  fi
  if is_complete_install; then
    print_maintenance_menu
    local choice
    choice="$(prompt "Opção" "1")"
    case "$choice" in
      1 | 6) action_verify ;;
      2 | 3) configure_ssl; health_check ;;
      4) action_update ;;
      5) action_restart ;;
      7) exit 0 ;;
      *) de_err "Opção inválida"; exit 1 ;;
    esac
  else
    print_first_menu
    local choice
    choice="$(prompt "Opção" "1")"
    case "$choice" in
      1) action_new_install ;;
      2) configure_ssl ;;
      3) action_update ;;
      4) action_verify ;;
      5) action_repair ;;
      6) exit 0 ;;
      *) de_err "Opção inválida"; exit 1 ;;
    esac
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
