#!/usr/bin/env bash
# PILOT-INFRA-1.3 — permissões de app.env, preservação de segredos e env do Prisma/Compose.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
# shellcheck disable=SC1091
. "${ROOT}/infrastructure/scripts/lib/install-lib.sh"

fail=0
assert_ok() {
  local label="$1"
  if ! eval "$2"; then
    printf 'FALHOU: %s\n' "$label" >&2
    fail=1
  fi
}

assert_eq() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [[ "$actual" != "$expected" ]]; then
    printf 'FALHOU: %s\n  obtido:   %s\n  esperado: %s\n' "$label" "$actual" "$expected" >&2
    fail=1
  fi
}

mode_is_640() {
  local raw
  raw="$(de_file_mode "$1")"
  raw="${raw#0}"
  [[ "$raw" == "640" ]]
}

same_secret() {
  local a="$1"
  local b="$2"
  local label="$3"
  if [[ "$a" != "$b" ]]; then
    printf 'FALHOU: %s (valores não exibidos)\n' "$label" >&2
    fail=1
  fi
}

file_not_world_readable() {
  python3 - "$1" <<'PY'
import os, stat, sys
mode = os.stat(sys.argv[1]).st_mode
sys.exit(0 if (mode & (stat.S_IROTH | stat.S_IWOTH | stat.S_IXOTH)) == 0 else 1)
PY
}

file_group_readable() {
  python3 - "$1" <<'PY'
import os, stat, sys
mode = os.stat(sys.argv[1]).st_mode
sys.exit(0 if (mode & stat.S_IRGRP) else 1)
PY
}

INSTALLER="${ROOT}/infrastructure/scripts/install.sh"
LIB="${ROOT}/infrastructure/scripts/lib/install-lib.sh"

assert_ok "A/B helper de permissão canônica" 'grep -q "^de_apply_secret_file_perms()" "$LIB"'
assert_ok "A/B instalador aplica root:dashboard 0640 em app.env" 'grep -qF '"'"'de_apply_secret_file_perms "$APP_ENV_FILE" root "$SERVICE_GROUP" 640'"'"' "$INSTALLER"'
assert_ok "web.env segue a mesma política" 'grep -qF '"'"'de_apply_secret_file_perms "$WEB_ENV_FILE" root "$SERVICE_GROUP" 640'"'"' "$INSTALLER"'
assert_ok "dir etc 0750 root:dashboard" 'grep -qF '"'"'chown "root:${SERVICE_GROUP}" "$ETC_DIR"'"'"' "$INSTALLER" && grep -qF '"'"'chmod 0750 "$ETC_DIR"'"'"' "$INSTALLER"'
assert_ok "proibido chmod 644 em app.env" '! grep -qE "chmod[[:space:]]+0?644" "$INSTALLER" "$LIB"'
assert_ok "proibido chmod 777" '! grep -qE "chmod[[:space:]]+777" "$INSTALLER" "$LIB"'
assert_ok "C keep_secrets nas chaves persistidas" 'grep -qF '"'"'de_env_upsert "$APP_ENV_FILE" "AUTH_SECRET"'"'"' "$INSTALLER" && grep -qF '"'"'de_env_upsert "$APP_ENV_FILE" "CONTA_AZUL_CLIENT_SECRET"'"'"' "$INSTALLER"'
assert_ok "C reexecução preserva Conta Azul já presente" 'grep -q "já constam em app.env e serão preservadas" "$INSTALLER"'
assert_ok "F Prisma/build como SERVICE_USER" 'grep -A30 "^build_application()" "$INSTALLER" | grep -q de_run_as_user'
assert_ok "F env via DE_APP_ENV (sem secret em argv)" 'grep -q "DE_APP_ENV=" "$INSTALLER" && grep -q '"'"'. "$DE_APP_ENV"'"'"' "$INSTALLER"'
assert_ok "F não ecoa DATABASE_URL" '! grep -qE "echo.*DATABASE_URL|printf.*DATABASE_URL" "$INSTALLER"'
assert_ok "G compose_app usa --env-file" 'grep -A4 "^compose_app()" "$INSTALLER" | grep -q -- "--env-file"'
assert_ok "G postgres sobe via compose_app" 'grep -A12 "^start_postgres_redis()" "$INSTALLER" | grep -q "compose_app up -d postgres redis"'
assert_ok "H não destrói volumes" '! grep -qE "down[[:space:]]+-v|compose[[:space:]].*down[[:space:]].*-v" "$INSTALLER" "$LIB"'
assert_ok "H não faz migrate reset/db push" '! grep -qE "migrate[[:space:]]+reset|db[[:space:]]+push" "$INSTALLER"'
assert_ok "H reexecução parcial não conta app.env como concluída" 'grep -q "^is_complete_install()" "$INSTALLER" && grep -q "installed" "$INSTALLER"'
assert_ok "H menu de manutenção só se installed=true" 'grep -q "is_complete_install" "$INSTALLER" && ! grep -q "^is_installed()" "$INSTALLER"'

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ENV_FILE="${TMP}/app.env"

# A. arquivo novo termina 0640 (chmod após mv, sem umask).
umask 077
de_env_upsert "$ENV_FILE" "DATABASE_URL" "postgresql://dashboard:fixture-pass@127.0.0.1:5432/dashboard_economizacao" 0
assert_ok "A. app.env novo é 0640" 'mode_is_640 "$ENV_FILE"'
assert_ok "A. grupo pode ler (bit IRGRP)" 'file_group_readable "$ENV_FILE"'
assert_ok "E. others não leem (bits other off)" 'file_not_world_readable "$ENV_FILE"'
assert_ok "D. dono atual consegue ler" '[[ -r "$ENV_FILE" ]]'

# B. simula inode novo root:root 0640 (mv do tempfile) e repara só mode/group-policy sem mudar conteúdo.
printf 'AUTH_SECRET=fixture-auth-secret-do-not-log\nPOSTGRES_PASSWORD=fixture-pg-pass-do-not-log\n' >"$ENV_FILE"
chmod 0640 "$ENV_FILE"
before_cksum="$(cksum "$ENV_FILE" | awk '{print $1" "$2}')"
chmod 0600 "$ENV_FILE"
de_apply_secret_file_perms "$ENV_FILE" root dashboard 640
after_cksum="$(cksum "$ENV_FILE" | awk '{print $1" "$2}')"
assert_ok "B. reexecução corrige mode para 0640" 'mode_is_640 "$ENV_FILE"'
assert_eq "$after_cksum" "$before_cksum" "B. reparo de permissão não altera conteúdo"
assert_ok "B. conteúdo permanece após chmod 0600→0640" 'de_env_has_nonempty "$ENV_FILE" "AUTH_SECRET"'

export DE_ALLOW_NONROOT=1
export DE_DRY_RUN=0
export DE_ROOT_PREFIX="${TMP}/prefix"
# shellcheck disable=SC1091
. "$INSTALLER"
init_paths
ensure_dirs

write_out="$(mktemp "${TMP}/write.XXXXXX")"
write_runtime_env "http://203.0.113.10" "ip" "true" "ca-client-id" "ca-client-secret-fixture" "60" >"$write_out" 2>&1
assert_ok "A. write_runtime_env gera app.env 0640" 'mode_is_640 "$APP_ENV_FILE"'
assert_ok "A. web.env 0640" 'mode_is_640 "$WEB_ENV_FILE"'
assert_ok "C. AUTH_SECRET persistido" 'de_env_has_nonempty "$APP_ENV_FILE" "AUTH_SECRET"'
assert_ok "C. POSTGRES_PASSWORD persistido" 'de_env_has_nonempty "$APP_ENV_FILE" "POSTGRES_PASSWORD"'
assert_ok "C. INTEGRATION_ENCRYPTION_KEY persistido" 'de_env_has_nonempty "$APP_ENV_FILE" "INTEGRATION_ENCRYPTION_KEY"'
assert_ok "C. CLIENT_SECRET persistido" 'de_env_has_nonempty "$APP_ENV_FILE" "CONTA_AZUL_CLIENT_SECRET"'
assert_ok "F. DATABASE_URL presente no arquivo" 'de_env_has_nonempty "$APP_ENV_FILE" "DATABASE_URL"'
assert_ok "F. source disponibiliza DATABASE_URL sem imprimir" 'de_env_key_set_after_source "$APP_ENV_FILE" "DATABASE_URL"'
assert_ok "F. mimic Prisma/build com DE_APP_ENV" 'env DE_APP_ENV="$APP_ENV_FILE" bash --noprofile --norc -c '"'"'set -euo pipefail; set -a; . "$DE_APP_ENV"; set +a; [[ -n "${DATABASE_URL:-}" ]]'"'"''

auth1="$(de_env_get "$APP_ENV_FILE" "AUTH_SECRET")"
enc1="$(de_env_get "$APP_ENV_FILE" "INTEGRATION_ENCRYPTION_KEY")"
pg1="$(de_env_get "$APP_ENV_FILE" "POSTGRES_PASSWORD")"
id1="$(de_env_get "$APP_ENV_FILE" "CONTA_AZUL_CLIENT_ID")"
sec1="$(de_env_get "$APP_ENV_FILE" "CONTA_AZUL_CLIENT_SECRET")"

# B/C. segunda escrita (reexecução): novos valores no wizard não substituem segredos.
write_runtime_env "http://203.0.113.10" "ip" "true" "other-id" "other-secret-must-not-win" "30" >>"$write_out" 2>&1
auth2="$(de_env_get "$APP_ENV_FILE" "AUTH_SECRET")"
enc2="$(de_env_get "$APP_ENV_FILE" "INTEGRATION_ENCRYPTION_KEY")"
pg2="$(de_env_get "$APP_ENV_FILE" "POSTGRES_PASSWORD")"
id2="$(de_env_get "$APP_ENV_FILE" "CONTA_AZUL_CLIENT_ID")"
sec2="$(de_env_get "$APP_ENV_FILE" "CONTA_AZUL_CLIENT_SECRET")"
same_secret "$auth1" "$auth2" "C. AUTH_SECRET preservado na reexecução"
same_secret "$enc1" "$enc2" "C. INTEGRATION_ENCRYPTION_KEY preservado"
same_secret "$pg1" "$pg2" "C. POSTGRES_PASSWORD preservado"
same_secret "$id1" "$id2" "C. CLIENT_ID preservado"
same_secret "$sec1" "$sec2" "C. CLIENT_SECRET preservado"
assert_ok "B. app.env permanece 0640 após reexecução" 'mode_is_640 "$APP_ENV_FILE"'

# I. stdout/stderr do write_runtime_env não contém os segredos.
leak=0
while IFS= read -r secret; do
  [[ -n "$secret" ]] || continue
  if grep -F -- "$secret" "$write_out" >/dev/null 2>&1; then
    leak=1
  fi
done <<EOF
${auth1}
${enc1}
${pg1}
${sec1}
ca-client-secret-fixture
other-secret-must-not-win
EOF
assert_eq "$leak" "0" "I. nenhum secret no stdout/stderr do write_runtime_env"

# G. Compose recebe POSTGRES_* do --env-file, não do shell interativo.
COMPOSE_TMP="${TMP}/compose-proj"
mkdir -p "$COMPOSE_TMP"
cp "${ROOT}/compose.yaml" "${COMPOSE_TMP}/compose.yaml"
COMPOSE_ENV="${COMPOSE_TMP}/app.env"
{
  printf 'POSTGRES_DB=dashboard_economizacao\n'
  printf 'POSTGRES_USER=dashboard\n'
  printf 'POSTGRES_PASSWORD=fixture-compose-pass-do-not-log\n'
} >"$COMPOSE_ENV"
chmod 0640 "$COMPOSE_ENV"

if docker compose version >/dev/null 2>&1; then
  unset POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD || true
  if (
    unset POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD
    docker compose --project-directory "$COMPOSE_TMP" -f "${COMPOSE_TMP}/compose.yaml" config
  ) >/dev/null 2>&1; then
    printf 'FALHOU: G. compose config não deveria passar sem POSTGRES_* no shell nem --env-file\n' >&2
    fail=1
  else
    assert_ok "G. compose sem env-file falha sem POSTGRES_* no shell" 'true'
  fi
  if (
    unset POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD
    docker compose --project-directory "$COMPOSE_TMP" --env-file "$COMPOSE_ENV" \
      -f "${COMPOSE_TMP}/compose.yaml" config >/dev/null
  ); then
    assert_ok "G. compose --env-file injeta POSTGRES_* independente do shell" 'true'
  else
    printf 'FALHOU: G. compose --env-file deveria interpolar POSTGRES_*\n' >&2
    fail=1
  fi
else
  assert_ok "G. docker compose ausente neste host — coberto por grep compose_app --env-file" 'true'
fi

# H. estado parcial: app.env existe, installed != true → não é instalação completa.
de_write_state "$STATE_FILE" "sha" "deadbeef"
assert_ok "H. parcial sem installed=true" '! is_complete_install && is_partial_install'
de_write_state "$STATE_FILE" "installed" "true"
assert_ok "H. installed=true conclui" 'is_complete_install && ! is_partial_install'

if [[ "$fail" -ne 0 ]]; then
  printf 'Testes de permissões ENV: FALHA\n' >&2
  exit 1
fi
printf 'Testes de permissões ENV: OK\n'
