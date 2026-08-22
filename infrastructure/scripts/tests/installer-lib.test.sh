#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
# shellcheck disable=SC1091
. "${ROOT}/infrastructure/scripts/lib/install-lib.sh"

fail=0
assert_eq() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [[ "$actual" != "$expected" ]]; then
    printf 'FALHOU: %s\n  obtido:   %s\n  esperado: %s\n' "$label" "$actual" "$expected" >&2
    fail=1
  fi
}

assert_ok() {
  local label="$1"
  if ! eval "$2"; then
    printf 'FALHOU: %s\n' "$label" >&2
    fail=1
  fi
}

assert_eq "$(de_conta_azul_redirect_uri "https://piloto.example.com")" \
  "https://piloto.example.com/integrations/conta-azul/callback" \
  "redirect URI derivada"

assert_ok "domínio válido" 'de_is_domain dashboard.exemplo.com'
assert_ok "domínio inválido rejeitado" '! de_is_domain "nao e dominio"'
assert_ok "ipv4 válido" 'de_is_ipv4 203.0.113.10'
assert_ok "ipv4 inválido rejeitado" '! de_is_ipv4 999.1.1.1'
assert_ok "email válido" 'de_is_email ops@exemplo.com'
assert_ok "yes default vazio" 'de_yes_default ""'
assert_ok "yes default n" '! de_yes_default n'

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ENV_FILE="${TMP}/app.env"

de_env_upsert "$ENV_FILE" "AUTH_SECRET" "primeiro-segredo" 0
de_env_upsert "$ENV_FILE" "AUTH_SECRET" "segundo-segredo" 1
assert_eq "$(de_env_get "$ENV_FILE" "AUTH_SECRET")" "primeiro-segredo" "não sobrescreve segredo existente"

de_env_upsert "$ENV_FILE" "APP_URL" "http://203.0.113.10" 0
de_env_upsert "$ENV_FILE" "APP_URL" "https://piloto.example.com" 0
assert_eq "$(de_env_get "$ENV_FILE" "APP_URL")" "https://piloto.example.com" "atualiza APP_URL"

de_env_upsert "$ENV_FILE" "ALLOW_INSECURE_HTTP_SESSION" "true" 0
de_env_upsert "$ENV_FILE" "ALLOW_INSECURE_HTTP_SESSION" "false" 0
assert_eq "$(de_env_get "$ENV_FILE" "ALLOW_INSECURE_HTTP_SESSION")" "false" "desativa modo HTTP temporário"

TEMPLATE="${ROOT}/infrastructure/nginx/site-http.conf.template"
RENDERED="${TMP}/site.conf"
de_render_template "$TEMPLATE" "$RENDERED" \
  "__SERVER_NAME__=piloto.example.com" \
  "__LISTEN_PORT__=80" \
  "__ETC_DIR__=${TMP}/etc"
assert_ok "nginx template contém domínio" 'grep -q piloto.example.com "$RENDERED"'
assert_ok "nginx template encaminha /auth" 'grep -q "location ^~ /auth/" "$RENDERED"'

INSTALLER="${ROOT}/infrastructure/scripts/install.sh"
assert_ok "wizard chama bootstrap SUPER_ADMIN" 'grep -q "bootstrap:super-admin" "$INSTALLER" && grep -q "bootstrap-super-admin.js" "$INSTALLER"'
assert_ok "wizard não chama bootstrap:admin" '! grep -F "bootstrap-admin.js" "$INSTALLER" && ! grep -E "(^|[^[:alnum:]-])bootstrap:admin([^[:alnum:]-]|$)" "$INSTALLER"'
assert_ok "copy Super Administrador da Plataforma" 'grep -q "Configuração do Super Administrador da Plataforma" "$INSTALLER"'
assert_ok "explica acesso técnico de nível máximo" 'grep -q "acesso técnico e administrativo de nível máximo" "$INSTALLER"'
assert_ok "status SUPER_ADMIN configurado" 'grep -q "SUPER_ADMIN: configurado" "$INSTALLER"'
assert_ok "status não usa ADMIN configurado" '! grep -E "(^|[[:space:]])ADMIN: configurado" "$INSTALLER"'
assert_ok "não pede dados do Felipe" '! grep -qi "felipe" "$INSTALLER"'
assert_ok "senha não vai em argv" '! grep -E -- "--password" "$INSTALLER"'
assert_ok "senha segue via stdin" 'grep -Eq "printf .+pass" "$INSTALLER"'
assert_ok "instalador não hardcoda 6 vCPU / 12 GB / 300 GB" '! grep -Eq "6 vCPU|12 GB RAM|300 GB" "$INSTALLER"'
assert_ok "não usa safe.directory" '! grep -q "safe.directory" "$INSTALLER"'
assert_ok "não usa chmod 777" '! grep -qE "chmod[[:space:]]+777" "$INSTALLER"'
assert_ok "não usa chmod 644 em env" '! grep -qE "chmod[[:space:]]+0?644" "$INSTALLER"'
assert_ok "git operacional via git_as_app" 'grep -q "^git_as_app()" "$INSTALLER"'
assert_ok "clone como usuário da aplicação" 'grep -qF '"'"'de_run_as_user "$SERVICE_USER"'"'"' "$INSTALLER"'
assert_ok "update lê origin como git_as_app" 'grep -q "git_as_app remote get-url origin" "$INSTALLER"'
assert_ok "Client Secret avisa entrada oculta" 'grep -q "entrada oculta; ao colar nada será exibido" "$INSTALLER"'

chmod +x "${ROOT}/install.sh" "${ROOT}/infrastructure/scripts/install.sh" \
  "${ROOT}/infrastructure/scripts/tests/installer-lib.test.sh" \
  "${ROOT}/infrastructure/scripts/tests/installer-git-ownership.test.sh" \
  "${ROOT}/infrastructure/scripts/tests/installer-env-perms.test.sh" \
  "${ROOT}/infrastructure/scripts/tests/installer-runtime-home.test.sh" \
  "${ROOT}/infrastructure/scripts/tests/installer-nginx-default.test.sh"

if [[ "$fail" -ne 0 ]]; then
  printf 'Testes da lib do instalador: FALHA\n' >&2
  exit 1
fi

bash -n "${ROOT}/install.sh"
bash -n "${ROOT}/infrastructure/scripts/install.sh"
bash -n "${ROOT}/infrastructure/scripts/lib/install-lib.sh"
bash -n "${ROOT}/infrastructure/scripts/tests/installer-lib.test.sh"
bash -n "${ROOT}/infrastructure/scripts/tests/installer-git-ownership.test.sh"
bash -n "${ROOT}/infrastructure/scripts/tests/installer-env-perms.test.sh"
bash -n "${ROOT}/infrastructure/scripts/tests/installer-runtime-home.test.sh"
bash -n "${ROOT}/infrastructure/scripts/tests/installer-nginx-default.test.sh"

if command -v shellcheck >/dev/null 2>&1; then
  shellcheck -x "${ROOT}/infrastructure/scripts/lib/install-lib.sh"
  shellcheck -x "${ROOT}/infrastructure/scripts/install.sh"
  shellcheck -x "${ROOT}/install.sh"
  shellcheck -x "${ROOT}/infrastructure/scripts/tests/installer-lib.test.sh"
  shellcheck -x "${ROOT}/infrastructure/scripts/tests/installer-git-ownership.test.sh"
  shellcheck -x "${ROOT}/infrastructure/scripts/tests/installer-env-perms.test.sh"
  shellcheck -x "${ROOT}/infrastructure/scripts/tests/installer-runtime-home.test.sh"
  shellcheck -x "${ROOT}/infrastructure/scripts/tests/installer-nginx-default.test.sh"
fi

DE_ALLOW_NONROOT=1 DE_DRY_RUN=1 "${ROOT}/infrastructure/scripts/install.sh" --detect-only >/dev/null
printf '6\n' | DE_ALLOW_NONROOT=1 DE_DRY_RUN=1 "${ROOT}/infrastructure/scripts/install.sh" >/dev/null

bash "${ROOT}/infrastructure/scripts/tests/installer-git-ownership.test.sh"
bash "${ROOT}/infrastructure/scripts/tests/installer-env-perms.test.sh"
bash "${ROOT}/infrastructure/scripts/tests/installer-runtime-home.test.sh"
bash "${ROOT}/infrastructure/scripts/tests/installer-nginx-default.test.sh"

printf 'Testes da lib do instalador: OK\n'
