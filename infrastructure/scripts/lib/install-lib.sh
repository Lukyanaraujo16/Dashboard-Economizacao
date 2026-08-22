# shellcheck shell=bash
# Funções puras / testáveis do instalador. Não exige root.

de_log() {
  printf '%s\n' "$*"
}

de_err() {
  printf 'ERRO: %s\n' "$*" >&2
}

de_warn() {
  printf 'AVISO: %s\n' "$*" >&2
}

de_yes_default() {
  local answer="${1:-}"
  case "${answer}" in
    '' | [sS] | [sS][iI] | [yY] | [yY][eE][sS]) return 0 ;;
    *) return 1 ;;
  esac
}

de_is_ipv4() {
  local ip="$1"
  [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  local octet
  IFS=. read -r o1 o2 o3 o4 <<<"$ip"
  for octet in "$o1" "$o2" "$o3" "$o4"; do
    if ((octet < 0 || octet > 255)); then
      return 1
    fi
  done
  return 0
}

de_is_domain() {
  local domain="$1"
  [[ "$domain" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$ ]]
}

de_is_email() {
  local email="$1"
  [[ "$email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]
}

de_conta_azul_redirect_uri() {
  local app_url="${1%/}"
  printf '%s\n' "${app_url}/integrations/conta-azul/callback"
}

de_env_get() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 1
  local line
  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 1
  printf '%s\n' "${line#*=}"
}

de_env_has_nonempty() {
  local file="$1"
  local key="$2"
  local value
  value="$(de_env_get "$file" "$key" 2>/dev/null || true)"
  [[ -n "${value}" ]]
}

# Atualiza ou insere KEY=VALUE. Se keep_secrets=1 e a chave já tem valor, não sobrescreve.
de_env_upsert() {
  local file="$1"
  local key="$2"
  local value="$3"
  local keep_secrets="${4:-0}"
  local tmp found=0
  local line

  mkdir -p "$(dirname "$file")"
  touch "$file"

  if [[ "$keep_secrets" == "1" ]] && de_env_has_nonempty "$file" "$key"; then
    chmod 0640 "$file" 2>/dev/null || true
    return 0
  fi

  tmp="$(mktemp)"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "${key}="* ]]; then
      printf '%s=%s\n' "$key" "$value" >>"$tmp"
      found=1
    else
      printf '%s\n' "$line" >>"$tmp"
    fi
  done <"$file"
  if [[ "$found" -eq 0 ]]; then
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
  fi
  mv "$tmp" "$file"
  chmod 0640 "$file" 2>/dev/null || true
}

de_render_template() {
  local src="$1"
  local dest="$2"
  shift 2
  local content
  content="$(cat "$src")"
  local pair key value
  for pair in "$@"; do
    key="${pair%%=*}"
    value="${pair#*=}"
    content="${content//${key}/${value}}"
  done
  mkdir -p "$(dirname "$dest")"
  printf '%s\n' "$content" >"$dest"
}

de_detect_os_pretty() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    printf '%s\n' "${PRETTY_NAME:-${NAME:-unknown}}"
    return
  fi
  printf '%s\n' "unknown"
}

de_detect_os_id() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    printf '%s\n' "${ID:-unknown}"
    return
  fi
  printf '%s\n' "unknown"
}

de_detect_arch() {
  uname -m
}

de_detect_cpus() {
  nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || printf '0\n'
}

de_detect_ram_gb() {
  if [[ -f /proc/meminfo ]]; then
    awk '/MemTotal/ { printf "%.0f\n", $2 / 1024 / 1024 }' /proc/meminfo
    return
  fi
  printf '0\n'
}

de_detect_disk_gb() {
  local gb=""
  gb="$(df -BG / 2>/dev/null | awk 'NR==2 { gsub("G","",$4); print $4 }' || true)"
  if [[ -n "$gb" ]]; then
    printf '%s\n' "$gb"
    return 0
  fi
  printf '0\n'
}

de_cmd_exists() {
  command -v "$1" >/dev/null 2>&1
}

de_file_owner() {
  local path="$1"
  if stat -c '%U' "$path" >/dev/null 2>&1; then
    stat -c '%U' "$path"
    return
  fi
  stat -f '%Su' "$path"
}

de_is_root() {
  [[ "$(id -u 2>/dev/null || printf 1)" -eq 0 ]]
}

# Executa o comando como o usuário da aplicação. Sem root / DE_ALLOW_NONROOT: executa no processo atual.
de_run_as_user() {
  local user="$1"
  shift
  if [[ "${DE_ALLOW_NONROOT:-0}" == "1" ]] || ! de_is_root; then
    "$@"
    return
  fi
  if de_cmd_exists runuser; then
    runuser -u "$user" -- "$@"
    return
  fi
  if de_cmd_exists sudo; then
    sudo -u "$user" -- "$@"
    return
  fi
  de_err "Não há runuser/sudo para executar como ${user}."
  return 1
}

de_git_in_repo() {
  local user="$1"
  local repo="$2"
  shift 2
  local home="${DE_SERVICE_HOME:-$repo}"
  de_run_as_user "$user" env HOME="$home" PATH="${PATH:-/usr/bin:/bin}" git -C "$repo" "$@"
}

# Campo HOME de uma linha passwd (ex.: dashboard:x:999:987::/opt/...:/usr/sbin/nologin).
de_passwd_home_from_line() {
  local line="$1"
  printf '%s\n' "${line}" | cut -d: -f6
}

de_home_needs_update() {
  local current="$1"
  local desired="$2"
  [[ -n "$desired" && "$current" != "$desired" ]]
}

# Layout canônico: var_lib root 0755; home e storage do app 0750.
# Não chown do diretório-raiz var_lib.
de_ensure_runtime_layout() {
  local var_lib="$1"
  local home="$2"
  local storage="$3"
  local owner="${4:-}"
  local group="${5:-}"

  mkdir -p "$var_lib" "$home" "$storage"
  chmod 0755 "$var_lib"
  chmod 0750 "$home" "$storage"
  if [[ -z "$owner" || "${DE_ALLOW_NONROOT:-0}" == "1" ]] || ! de_is_root; then
    return 0
  fi
  chown -R "${owner}:${group}" "$home" "$storage"
}

# Ownership do working tree Git. No-op fora de root (testes locais).
de_chown_tree() {
  local spec="$1"
  local path="$2"
  [[ -e "$path" ]] || return 0
  if [[ "${DE_ALLOW_NONROOT:-0}" == "1" ]] || ! de_is_root; then
    return 0
  fi
  chown -R "$spec" "$path"
}

de_file_mode() {
  local path="$1"
  if stat -c '%a' "$path" >/dev/null 2>&1; then
    stat -c '%a' "$path"
    return
  fi
  stat -f '%OLp' "$path"
}

de_file_group() {
  local path="$1"
  if stat -c '%G' "$path" >/dev/null 2>&1; then
    stat -c '%G' "$path"
    return
  fi
  stat -f '%Sg' "$path"
}

# Permissão determinística de arquivo de segredo. Não usa umask. Não torna world-readable.
de_apply_secret_file_perms() {
  local file="$1"
  local owner="${2:-root}"
  local group="${3:-}"
  local mode="${4:-640}"
  [[ -e "$file" ]] || return 0
  chmod "$mode" "$file"
  if [[ "${DE_ALLOW_NONROOT:-0}" == "1" ]] || ! de_is_root; then
    return 0
  fi
  if [[ -n "$group" ]]; then
    chown "${owner}:${group}" "$file"
  else
    chown "$owner" "$file"
  fi
}

# True se, após source do arquivo, a chave está preenchida. Não imprime o valor.
de_env_key_set_after_source() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 1
  # $1=arquivo $2=nome da chave; ${!2} expande por nome. Sem echo do valor.
  bash --noprofile --norc -c 'set -euo pipefail; set -a; . "$1"; set +a; [[ -n "${!2}" ]]' bash "$file" "$key"
}

de_read_state() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 1
  grep -E "^${key}=" "$file" | tail -n 1 | cut -d= -f2-
}

de_write_state() {
  local file="$1"
  local key="$2"
  local value="$3"
  de_env_upsert "$file" "$key" "$value" 0
}

# Remove o site default da distro em sites-enabled. Nunca apaga sites-available.
de_disable_distro_nginx_default() {
  local enabled="$1"
  local available="$2"
  if [[ -e "$enabled" || -L "$enabled" ]]; then
    rm -f "$enabled"
  fi
}

# Reload só é permitido quando nginx -t retornou 0. if explícito — não use A && B || C.
de_nginx_may_reload_after_test() {
  local test_exit="$1"
  [[ "$test_exit" -eq 0 ]]
}

# Público é a app (Next), não a página Welcome da distro.
de_public_web_is_app() {
  local headers="$1"
  local body="$2"
  if printf '%s' "$body" | grep -q 'Welcome to nginx'; then
    return 1
  fi
  if printf '%s' "$headers" | grep -qiE '^x-powered-by:[[:space:]]*Next\.js'; then
    return 0
  fi
  if printf '%s' "$body" | grep -q '__NEXT_DATA__'; then
    return 0
  fi
  return 1
}
