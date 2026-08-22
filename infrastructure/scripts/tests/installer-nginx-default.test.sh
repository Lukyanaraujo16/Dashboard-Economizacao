#!/usr/bin/env bash
# PILOT-INFRA-1.5 — default_server Ubuntu vs Dashboard.
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

INSTALLER="${ROOT}/infrastructure/scripts/install.sh"
LIB="${ROOT}/infrastructure/scripts/lib/install-lib.sh"

assert_ok "J. nginx -t crítico não usa || true" '! grep -qE "nginx[[:space:]]+-t.*\|\|[[:space:]]*true" "$INSTALLER"'
assert_ok "J. não mascara reload com A && B || C" '! grep -qE "nginx[[:space:]]+-t[[:space:]]+&&[[:space:]]+systemctl[[:space:]]+reload[[:space:]]+nginx[[:space:]]+\|\|" "$INSTALLER"'
assert_ok "I. repair chama apply_nginx_config" 'grep -A25 "^action_repair()" "$INSTALLER" | grep -q apply_nginx_config'
assert_ok "H. SSL/render desabilita default" 'grep -q de_disable_distro_nginx_default "$INSTALLER"'
assert_ok "H. SSL não recria sites-enabled/default" '! grep -qE "ln .*sites-enabled/default" "$INSTALLER"'
assert_ok "menu manutenção tem reparar" 'grep -q "\\[8\\] Reparar serviços" "$INSTALLER"'
assert_ok "SUPER_ADMIN já configurado é preservado" 'grep -q "SUPER_ADMIN já configurado; conta existente preservada" "$INSTALLER"'
assert_ok "installed=true só após health público" 'grep -q "Health Nginx/WEB_PUBLIC falhou. Instalação não marcada como concluída" "$INSTALLER"'

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ENABLED="${TMP}/sites-enabled/default"
AVAILABLE="${TMP}/sites-available/default"
mkdir -p "$(dirname "$ENABLED")" "$(dirname "$AVAILABLE")"
printf 'listen 80 default_server;\n' >"$AVAILABLE"
ln -s "$AVAILABLE" "$ENABLED"

# A. default habilitado é desabilitado.
de_disable_distro_nginx_default "$ENABLED" "$AVAILABLE"
assert_ok "A. symlink default removido" '[[ ! -e "$ENABLED" && ! -L "$ENABLED" ]]'
# B. available preservado.
assert_ok "B. sites-available/default preservado" '[[ -f "$AVAILABLE" ]] && grep -q default_server "$AVAILABLE"'

# C. reexecução idempotente.
de_disable_distro_nginx_default "$ENABLED" "$AVAILABLE"
assert_ok "C. segunda execução não falha e não recria" '[[ ! -e "$ENABLED" && -f "$AVAILABLE" ]]'

# D/E. reload só se nginx -t passou.
assert_ok "D. nginx -t fail não autoriza reload" '! de_nginx_may_reload_after_test 1'
assert_ok "E. nginx -t pass autoriza reload" 'de_nginx_may_reload_after_test 0'

# F. interno ok + Welcome não é WEB pública.
UBUNTU_HDR=$'HTTP/1.1 200 OK\r\nServer: nginx\r\n\r\n'
UBUNTU_BODY='<html><body><h1>Welcome to nginx!</h1></body></html>'
assert_ok "F. Welcome to nginx não passa no público" '! de_public_web_is_app "$UBUNTU_HDR" "$UBUNTU_BODY"'

# G. Dashboard público.
NEXT_HDR=$'HTTP/1.1 200 OK\r\nX-Powered-By: Next.js\r\n\r\n'
NEXT_BODY='<html><script id="__NEXT_DATA__" type="application/json">{}</script></html>'
assert_ok "G. Next.js no público passa" 'de_public_web_is_app "$NEXT_HDR" "$NEXT_BODY"'

export DE_ALLOW_NONROOT=1
export DE_DRY_RUN=0
export DE_ROOT_PREFIX="${TMP}/prefix"
# shellcheck disable=SC1091
. "$INSTALLER"
init_paths
mkdir -p "$(dirname "$NGINX_DISTRO_DEFAULT_ENABLED")" "$(dirname "$NGINX_DISTRO_DEFAULT_AVAILABLE")" \
  "$(dirname "$NGINX_ENABLED")"
printf 'ubuntu default\n' >"$NGINX_DISTRO_DEFAULT_AVAILABLE"
ln -sfn "$NGINX_DISTRO_DEFAULT_AVAILABLE" "$NGINX_DISTRO_DEFAULT_ENABLED"
render_nginx_http "203.0.113.10"
assert_ok "A. render desabilita default enabled" '[[ ! -e "$NGINX_DISTRO_DEFAULT_ENABLED" ]]'
assert_ok "B. available intacto após render" '[[ -f "$NGINX_DISTRO_DEFAULT_AVAILABLE" ]]'
assert_ok "dashboard enabled existe" '[[ -L "$NGINX_ENABLED" ]]'
render_nginx_http "203.0.113.10"
assert_ok "C. re-render não recria default" '[[ ! -e "$NGINX_DISTRO_DEFAULT_ENABLED" ]]'

if [[ "$fail" -ne 0 ]]; then
  printf 'Testes de Nginx default_server: FALHA\n' >&2
  exit 1
fi
printf 'Testes de Nginx default_server: OK\n'
