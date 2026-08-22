#!/usr/bin/env bash
# PILOT-INFRA-1.2 — ownership Git do clone operacional.
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

INSTALLER="${ROOT}/infrastructure/scripts/install.sh"
assert_ok "clone/fetch usam de_run_as_user" 'grep -qF '"'"'de_run_as_user "$SERVICE_USER"'"'"' "$INSTALLER"'
assert_ok "git_as_app encapsula git do APP_HOME" 'grep -q "^git_as_app()" "$INSTALLER"'
assert_ok "update usa git_as_app para origin" 'grep -q "git_as_app remote get-url origin" "$INSTALLER"'
assert_ok "update chama sync_application_code" 'grep -A20 "^action_update()" "$INSTALLER" | grep -q "sync_application_code"'
assert_ok "não usa safe.directory" '! grep -q "safe.directory" "$INSTALLER" "${ROOT}/infrastructure/scripts/lib/install-lib.sh"'
assert_ok "não usa chmod 777" '! grep -qE "chmod[[:space:]]+777" "$INSTALLER" "${ROOT}/infrastructure/scripts/lib/install-lib.sh"'
assert_ok "etc permanece root:group" 'grep -qF '"'"'chown root:"$SERVICE_GROUP" "$ETC_DIR"'"'"' "$INSTALLER"'
assert_ok "app.env usa permissão canônica 0640 via helper" 'grep -q "de_apply_secret_file_perms" "$INSTALLER" && grep -q "^secure_runtime_env_files()" "$INSTALLER"'
assert_ok "Client Secret com aviso de entrada oculta" 'grep -q "entrada oculta; ao colar nada será exibido" "$INSTALLER"'
assert_ok "dry-run declara usuário dashboard" 'grep -qF '"'"'git clone/checkout como ${SERVICE_USER}'"'"' "$INSTALLER"'

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export GIT_CONFIG_GLOBAL="${TMP}/gitconfig.global"
export GIT_CONFIG_SYSTEM="${TMP}/gitconfig.system"
touch "$GIT_CONFIG_GLOBAL" "$GIT_CONFIG_SYSTEM"

UPSTREAM_SRC="${TMP}/upstream-src"
mkdir -p "$UPSTREAM_SRC"
git -C "$UPSTREAM_SRC" init -q
git -C "$UPSTREAM_SRC" config user.email "piloto@example.test"
git -C "$UPSTREAM_SRC" config user.name "Piloto"
printf 'ok\n' >"${UPSTREAM_SRC}/README"
git -C "$UPSTREAM_SRC" add README
git -C "$UPSTREAM_SRC" commit -q -m "init"
SHA1="$(git -C "$UPSTREAM_SRC" rev-parse HEAD)"
printf 'v2\n' >"${UPSTREAM_SRC}/README"
git -C "$UPSTREAM_SRC" add README
git -C "$UPSTREAM_SRC" commit -q -m "second"
SHA2="$(git -C "$UPSTREAM_SRC" rev-parse HEAD)"
UPSTREAM="${TMP}/upstream.git"
git clone -q --bare "$UPSTREAM_SRC" "$UPSTREAM"
REMOTE="file://${UPSTREAM}"

export DE_ALLOW_NONROOT=1
export DE_DRY_RUN=0
export DE_ROOT_PREFIX="${TMP}/prefix"
# shellcheck disable=SC1091
. "$INSTALLER"
init_paths
ensure_dirs
mkdir -p "$(dirname "$APP_HOME")" "$ETC_DIR"
chmod 0750 "$ETC_DIR"
printf 'AUTH_SECRET=placeholder\n' >"$APP_ENV_FILE"
chmod 0640 "$APP_ENV_FILE"

sync_application_code "$SHA1" "$REMOTE"

OWNER="$(id -un)"
assert_eq "$(de_file_owner "$APP_HOME")" "$OWNER" "A. raiz do clone pertence ao usuário da aplicação (teste local)"
assert_eq "$(de_file_owner "${APP_HOME}/.git")" "$OWNER" "B. .git pertence ao mesmo usuário"
assert_eq "$(de_file_owner "${APP_HOME}/README")" "$OWNER" "A. arquivo do repo pertence ao mesmo usuário"
assert_eq "$(git_as_app rev-parse HEAD)" "$SHA1" "checkout no SHA solicitado"

assert_ok "D. git status sem safe.directory" 'GIT_CONFIG_GLOBAL="${TMP}/gitconfig.global" GIT_CONFIG_SYSTEM="${TMP}/gitconfig.system" git -C "$APP_HOME" status >/dev/null'

# C. reexecução sobre clone já presente (simula falha após clone, sem apagar).
sync_application_code "$SHA1" "$REMOTE"
assert_eq "$(git_as_app rev-parse HEAD)" "$SHA1" "C. reexecução no mesmo SHA é idempotente"

# E. update: fetch/checkout de SHA novo como o mesmo usuário.
sync_application_code "$SHA2" "$REMOTE"
assert_eq "$(git_as_app rev-parse HEAD)" "$SHA2" "E. update checkout SHA novo"
assert_eq "$(de_file_owner "${APP_HOME}/.git")" "$OWNER" "E. .git permanece do usuário da aplicação após update"

# F. /etc não é chowned para o usuário da aplicação; permissão de app.env preservada.
ETC_MODE="$(stat -f '%OLp' "$APP_ENV_FILE" 2>/dev/null || stat -c '%a' "$APP_ENV_FILE")"
assert_eq "$ETC_MODE" "640" "F. app.env permanece 0640"
assert_ok "F. ETC_DIR não está dentro de APP_HOME" '[[ "$ETC_DIR" != "$APP_HOME"* ]]'
assert_ok "HOME operacional não é o clone Git" '[[ "$SERVICE_HOME" != "$APP_HOME" ]]'
assert_ok "clone não cria .config/.local/.cache no repo" '[[ ! -e "$APP_HOME/.config" && ! -e "$APP_HOME/.local" && ! -e "$APP_HOME/.cache" ]]'

de_run_as_user "$OWNER" true
assert_ok "de_run_as_user executa com DE_ALLOW_NONROOT" 'true'

if [[ "$fail" -ne 0 ]]; then
  printf 'Testes de ownership Git: FALHA\n' >&2
  exit 1
fi
printf 'Testes de ownership Git: OK\n'
