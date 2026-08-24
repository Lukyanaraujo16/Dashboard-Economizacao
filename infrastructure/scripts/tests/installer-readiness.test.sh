#!/usr/bin/env bash
# PILOT-INFRA-1.6 — readiness pós-restart (PROCESS_RUNNING ≠ SERVICE_READY).
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
LIB="${ROOT}/infrastructure/scripts/lib/install-lib.sh"

FAKE_NOW=1000
SLEEP_COUNT=0
de_now_epoch() {
  printf '%s\n' "$FAKE_NOW"
}
de_sleep() {
  SLEEP_COUNT=$((SLEEP_COUNT + 1))
  FAKE_NOW=$((FAKE_NOW + $1))
}
reset_clock() {
  FAKE_NOW=1000
  SLEEP_COUNT=0
}

stub_ok_rest() {
  de_http_public_ok() { return 0; }
  de_nginx_config_ok() { return 0; }
  de_systemd_is_failed() { return 1; }
  de_systemd_is_active() { return 1; }
}

# L. timeout/intervalo padrão.
unset DE_READINESS_TIMEOUT DE_READINESS_INTERVAL || true
assert_eq "$(de_readiness_timeout)" "30" "L. timeout default 30s"
assert_eq "$(de_readiness_interval)" "1" "L. intervalo default 1s"
assert_ok "L. health_check não faz curl único" \
  '! grep -qE "curl -fsS --max-time 5 http://127.0.0.1:3001/health" "$INSTALLER"'
assert_ok "L. wait usa timeout configurável" 'grep -q "DE_READINESS_TIMEOUT:-30" "$LIB"'
assert_ok "L. wait usa intervalo configurável" 'grep -q "DE_READINESS_INTERVAL:-1" "$LIB"'

# A. API demora 2 tentativas e passa.
reset_clock
API_TRIES=0
de_http_ok() {
  API_TRIES=$((API_TRIES + 1))
  [[ "$API_TRIES" -ge 2 ]]
}
de_systemd_is_failed() { return 1; }
wr=0
de_wait_http "API" "http://127.0.0.1:3001/health" 30 1 "dashboard-economizacao-api.service" || wr=$?
assert_eq "$wr" "0" "A. PASS após retry"
assert_eq "$API_TRIES" "2" "A. duas tentativas"
assert_eq "$DE_WAIT_REASON" "ok" "A. reason ok"
assert_ok "A. elapsed >= 1s" '[[ "$DE_WAIT_ELAPSED" -ge 1 ]]'
assert_ok "A. formato OK (Ns)" '[[ "$(de_format_ready_line 0 "$DE_WAIT_ELAPSED")" == OK* ]]'

# B. API nunca responde — FAIL após timeout.
reset_clock
de_http_ok() { return 1; }
de_systemd_is_failed() { return 1; }
wr=0
de_wait_http "API" "http://127.0.0.1:3001/health" 3 1 "" || wr=$?
assert_eq "$wr" "1" "B. FAIL após timeout"
assert_eq "$DE_WAIT_REASON" "timeout" "B. reason timeout"
assert_ok "B. elapsed >= 3s" '[[ "$DE_WAIT_ELAPSED" -ge 3 ]]'
assert_ok "B. formato FALHA após Ns" \
  '[[ "$(de_format_ready_line 1 "$DE_WAIT_ELAPSED")" == "FALHA após "* ]]'

# C. systemd failed — FAIL antecipado, sem esperar timeout.
reset_clock
de_http_ok() { return 1; }
de_systemd_is_failed() { return 0; }
wr=0
de_wait_http "API" "http://127.0.0.1:3001/health" 30 1 "dashboard-economizacao-api.service" || wr=$?
assert_eq "$wr" "2" "C. FAIL antecipado (systemd)"
assert_eq "$DE_WAIT_REASON" "systemd-failed" "C. reason systemd-failed"
assert_eq "$SLEEP_COUNT" "0" "C. não dorme o timeout inteiro"
assert_eq "$(de_format_ready_line 2 0)" "FALHA (systemd failed)" "C. formato systemd failed"

# D. DB/Redis só depois da API pronta.
reset_clock
HTTP_CALLS=()
de_http_ok() {
  HTTP_CALLS+=("$1")
  return 1
}
stub_ok_rest
export DE_READINESS_TIMEOUT=2
export DE_READINESS_INTERVAL=1
de_evaluate_readiness "http://203.0.113.10" 0 || true
db_calls=0
redis_calls=0
api_calls=0
for u in "${HTTP_CALLS[@]}"; do
  case "$u" in
    */health/db) db_calls=$((db_calls + 1)) ;;
    */health/redis) redis_calls=$((redis_calls + 1)) ;;
    */health) api_calls=$((api_calls + 1)) ;;
  esac
done
assert_ok "D. API foi sondada" '[[ "$api_calls" -ge 1 ]]'
assert_eq "$db_calls" "0" "D. DB não sondado antes da API"
assert_eq "$redis_calls" "0" "D. Redis não sondado antes da API"
assert_eq "$DE_RDY_DB" "não avaliado" "D. DB não avaliado"
assert_eq "$DE_RDY_REDIS" "não avaliado" "D. Redis não avaliado"
assert_ok "D. API não OK" '! de_status_is_ok "$DE_RDY_API"'
assert_eq "$DE_RDY_RC" "1" "D. readiness falha se API falha"

# E. Next demora alguns segundos — WEB_INTERNAL PASS.
reset_clock
WEB_TRIES=0
de_http_ok() {
  case "$1" in
    */login)
      WEB_TRIES=$((WEB_TRIES + 1))
      [[ "$WEB_TRIES" -ge 3 ]]
      ;;
    *) return 0 ;;
  esac
}
stub_ok_rest
export DE_READINESS_TIMEOUT=30
de_evaluate_readiness "http://203.0.113.10" 0 || true
assert_ok "E. WEB_INTERNAL PASS" 'de_status_is_ok "$DE_RDY_WEB_INT"'
assert_eq "$WEB_TRIES" "3" "E. Next em 3 tentativas"
assert_ok "E. API PASS" 'de_status_is_ok "$DE_RDY_API"'
assert_ok "E. DB PASS após API" 'de_status_is_ok "$DE_RDY_DB"'

# F. público demora após reload — WEB_PUBLIC PASS.
reset_clock
PUB_TRIES=0
de_http_ok() { return 0; }
de_http_public_ok() {
  PUB_TRIES=$((PUB_TRIES + 1))
  [[ "$PUB_TRIES" -ge 2 ]]
}
de_nginx_config_ok() { return 0; }
de_systemd_is_failed() { return 1; }
de_systemd_is_active() { return 1; }
export DE_READINESS_TIMEOUT=30
de_evaluate_readiness "http://203.0.113.10" 0 || true
assert_ok "F. WEB_PUBLIC PASS" 'de_status_is_ok "$DE_RDY_WEB_PUB"'
assert_eq "$PUB_TRIES" "2" "F. público em 2 tentativas"
assert_eq "$DE_RDY_NGINX" "OK" "F. NGINX_CONFIG OK"
assert_eq "$DE_RDY_RC" "0" "F. readiness completa"

# G. público nunca sobe — FAIL.
reset_clock
de_http_ok() { return 0; }
de_http_public_ok() { return 1; }
de_nginx_config_ok() { return 0; }
de_systemd_is_failed() { return 1; }
de_systemd_is_active() { return 1; }
export DE_READINESS_TIMEOUT=2
de_evaluate_readiness "http://203.0.113.10" 0 || true
assert_ok "G. WEB_PUBLIC FAIL" '! de_status_is_ok "$DE_RDY_WEB_PUB"'
assert_eq "$DE_RDY_RC" "1" "G. rc 1"
assert_ok "G. Welcome to nginx rejeitado" \
  '! de_public_web_is_app $'"'"'HTTP/1.1 200 OK\r\n\r\n'"'"' "<h1>Welcome to nginx!</h1>"'

# H. repair/restart não produz falso negativo após delay normal.
reset_clock
de_http_ok() { return 0; }
de_http_public_ok() { return 0; }
de_nginx_config_ok() { return 0; }
de_systemd_is_failed() { return 1; }
de_systemd_is_active() { return 1; }
export DE_READINESS_TIMEOUT=30
de_evaluate_readiness "http://203.0.113.10" 0
assert_eq "$DE_RDY_RC" "0" "H. restart normal PASS"
assert_ok "H. repair chama action_restart" \
  'grep -A25 "^action_repair()" "$INSTALLER" | grep -q action_restart'
assert_ok "H. restart chama health_check" \
  'grep -A15 "^action_restart()" "$INSTALLER" | grep -q health_check'
assert_ok "H. health_check usa wait" 'grep -q de_evaluate_readiness "$INSTALLER"'

# I. primeira instalação usa a mesma readiness.
assert_ok "I. nova instalação chama health_check" \
  'grep -A90 "^action_new_install()" "$INSTALLER" | grep -q health_check'
assert_ok "I. installed=true só após health_check" \
  'grep -B6 "installed\" \"true\"" "$INSTALLER" | grep -q health_check'

# J. update usa a mesma readiness.
assert_ok "J. update chama action_restart" \
  'grep -A25 "^action_update()" "$INSTALLER" | grep -q action_restart'

# K. nenhum loop infinito (relógio parado ainda retorna).
reset_clock
de_now_epoch() { printf '1000\n'; }
de_sleep() { SLEEP_COUNT=$((SLEEP_COUNT + 1)); }
de_http_ok() { return 1; }
de_systemd_is_failed() { return 1; }
wr=0
de_wait_http "API" "http://127.0.0.1:3001/health" 3 1 "" || wr=$?
assert_eq "$wr" "1" "K. retorna com relógio parado"
assert_ok "K. ticks limitados" '[[ "$SLEEP_COUNT" -le 8 ]]'
assert_ok "K. de_wait_until tem max_ticks" 'grep -q max_ticks "$LIB"'
de_now_epoch() { printf '%s\n' "$FAKE_NOW"; }
de_sleep() {
  SLEEP_COUNT=$((SLEEP_COUNT + 1))
  FAKE_NOW=$((FAKE_NOW + $1))
}

# M. installed=true só após readiness completa.
assert_ok "M. mensagem bloqueia installed" \
  'grep -q "Readiness incompleta. Instalação não marcada como concluída" "$INSTALLER"'
assert_ok "M. evaluate exige API+DB+Redis+web+nginx+público" \
  'grep -q "de_status_is_ok \"\$DE_RDY_API\"" "$LIB" && grep -q "de_status_is_ok \"\$DE_RDY_DB\"" "$LIB" && grep -q "de_status_is_ok \"\$DE_RDY_REDIS\"" "$LIB" && grep -q "de_status_is_ok \"\$DE_RDY_WEB_INT\"" "$LIB" && grep -q "de_status_is_ok \"\$DE_RDY_WEB_PUB\"" "$LIB"'
assert_ok "M. health_check não usa curl one-shot" \
  '! awk "/^health_check\\(\\)/,/^}$/" "$INSTALLER" | grep -q "curl -fsS"'

if [[ "$fail" -ne 0 ]]; then
  printf 'Testes de readiness pós-restart: FALHA\n' >&2
  exit 1
fi
printf 'Testes de readiness pós-restart: OK\n'
