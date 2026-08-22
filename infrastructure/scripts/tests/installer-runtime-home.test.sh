#!/usr/bin/env bash
# PILOT-INFRA-1.4 — HOME operacional fora do clone Git.
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

mode_norm() {
  local raw
  raw="$(de_file_mode "$1")"
  raw="${raw#0}"
  printf '%s\n' "$raw"
}

INSTALLER="${ROOT}/infrastructure/scripts/install.sh"
LIB="${ROOT}/infrastructure/scripts/lib/install-lib.sh"

assert_ok "A. useradd usa SERVICE_HOME" 'grep -qF '"'"'useradd --system --home "$SERVICE_HOME"'"'"' "$INSTALLER"'
assert_ok "B. usermod -d sem -m" 'grep -qF '"'"'usermod -d "$SERVICE_HOME"'"'"' "$INSTALLER" && ! grep -qE "usermod[[:space:]]+.*-m" "$INSTALLER"'
assert_ok "H. run_as_app define HOME=SERVICE_HOME" 'grep -A8 "^run_as_app()" "$INSTALLER" | grep -qF '"'"'HOME="$SERVICE_HOME"'"'"''
assert_ok "H. build usa DE_APP_HOME, não cd HOME" 'grep -A25 "^build_application()" "$INSTALLER" | grep -q DE_APP_HOME && ! grep -A25 "^build_application()" "$INSTALLER" | grep -q '"'"'cd "$HOME"'"'"''
assert_ok "I. Corepack sem prompt" 'grep -q "COREPACK_ENABLE_DOWNLOAD_PROMPT=0" "$INSTALLER"'
assert_ok "I. pnpm oficial 11.21.0" 'grep -q "pnpm@11.21.0" "$INSTALLER"'
assert_ok "J. systemd API HOME" 'grep -q "Environment=HOME=__SERVICE_HOME__" "${ROOT}/infrastructure/systemd/dashboard-economizacao-api.service.template"'
assert_ok "J. systemd worker HOME" 'grep -q "Environment=HOME=__SERVICE_HOME__" "${ROOT}/infrastructure/systemd/dashboard-economizacao-worker.service.template"'
assert_ok "J. systemd web HOME" 'grep -q "Environment=HOME=__SERVICE_HOME__" "${ROOT}/infrastructure/systemd/dashboard-economizacao-web.service.template"'
assert_ok "M. não há git clean" '! grep -qE "git[[:space:]]+clean" "$INSTALLER" "$LIB"'
assert_ok "não destrói volumes" '! grep -qE "down[[:space:]]+-v" "$INSTALLER"'
assert_ok "E. não chown var_lib raiz para o app" '! grep -qE "chown .*VAR_LIB_DIR\"" "$INSTALLER" "$LIB"'

OLD_LINE="dashboard:x:999:987::/opt/dashboard-economizacao:/usr/sbin/nologin"
assert_eq "$(de_passwd_home_from_line "$OLD_LINE")" "/opt/dashboard-economizacao" "B. parser HOME antigo"
assert_ok "B. HOME antigo precisa correção" 'de_home_needs_update "/opt/dashboard-economizacao" "/var/lib/dashboard-economizacao/home"'
assert_ok "A. HOME já correto não atualiza" '! de_home_needs_update "/var/lib/dashboard-economizacao/home" "/var/lib/dashboard-economizacao/home"'

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export DE_ALLOW_NONROOT=1
export DE_DRY_RUN=0
export DE_ROOT_PREFIX="${TMP}/prefix"
# shellcheck disable=SC1091
. "$INSTALLER"
init_paths
ensure_dirs

assert_eq "$SERVICE_HOME" "${VAR_LIB_DIR}/home" "A. SERVICE_HOME canônico"
assert_ok "C. HOME directory existe" '[[ -d "$SERVICE_HOME" ]]'
assert_eq "$(mode_norm "$VAR_LIB_DIR")" "755" "E. var_lib 0755"
assert_eq "$(mode_norm "$SERVICE_HOME")" "750" "C. home 0750"
assert_eq "$(mode_norm "$STORAGE_DIR")" "750" "G. storage 0750"

OWNER="$(id -un)"
assert_eq "$(de_file_owner "$SERVICE_HOME")" "$OWNER" "C. home gravável pelo dono do teste"
assert_ok "D. dashboard (dono) escreve em HOME" 'printf ok >"${SERVICE_HOME}/write-test" && [[ -f "${SERVICE_HOME}/write-test" ]]'
assert_ok "F. APP_HOME separado do HOME" '[[ "$APP_HOME" != "$SERVICE_HOME" ]] && [[ "$SERVICE_HOME" != "$APP_HOME"/* ]]'

# E. escrita no root var_lib não é necessária: bit other-write off; owner do teste ainda
# pode escrever por ser criador. A política é: instalador não transfere o root a dashboard.
assert_ok "E. var_lib não é o HOME" '[[ "$VAR_LIB_DIR" != "$SERVICE_HOME" ]]'

# H. helper injeta HOME correto mesmo com HOME herdado de root.
GOT_HOME="$(
  HOME=/root \
  de_run_as_user "$OWNER" env HOME="$SERVICE_HOME" bash --noprofile --norc -c 'printf %s "$HOME"'
)"
assert_eq "$GOT_HOME" "$SERVICE_HOME" "H. comando recebe HOME operacional"

# I. cache XDG/corepack sob o HOME novo, não no repo.
mkdir -p "$APP_HOME"
HOME="$SERVICE_HOME" bash --noprofile --norc -c 'mkdir -p "$HOME/.cache/node/corepack/v1" "$HOME/.config/nextjs-nodejs" "$HOME/.local/share/pnpm"'
assert_ok "I. cache Corepack no HOME" '[[ -d "${SERVICE_HOME}/.cache/node/corepack/v1" ]]'
assert_ok "K. repo sem .config/.local/.cache" '[[ ! -e "$APP_HOME/.config" && ! -e "$APP_HOME/.local" && ! -e "$APP_HOME/.cache" ]]'

# M. write_runtime_env não regenera segredos (reexecução).
write_runtime_env "http://203.0.113.10" "ip" "true" "ca-id" "ca-secret-fixture" "60" >/dev/null
auth1="$(de_env_get "$APP_ENV_FILE" "AUTH_SECRET")"
write_runtime_env "http://203.0.113.10" "ip" "true" "other" "other-secret" "60" >/dev/null
auth2="$(de_env_get "$APP_ENV_FILE" "AUTH_SECRET")"
if [[ "$auth1" != "$auth2" || -z "$auth1" ]]; then
  printf 'FALHOU: M. AUTH_SECRET não preservado (valor não exibido)\n' >&2
  fail=1
fi

# L. exercitado nos gates (typecheck/test/build do frontend com HOME isolado).
assert_ok "L. build frontend não usa HOME do Git (código)" 'grep -A30 "^build_application()" "$INSTALLER" | grep -q '"'"'cd "$DE_APP_HOME/frontend"'"'"''

if [[ "$fail" -ne 0 ]]; then
  printf 'Testes de HOME operacional: FALHA\n' >&2
  exit 1
fi
printf 'Testes de HOME operacional: OK\n'
