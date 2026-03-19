#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="real-estate-watcher"
SERVICE_USER="realestate"
SERVICE_GROUP="realestate"
APP_DIR="/opt/real-estate-watcher"
ENV_DIR="/etc/real-estate-watcher"
ENV_FILE="$ENV_DIR/real-estate-watcher.env"
STATE_DIR="/var/lib/real-estate-watcher"
CACHE_DIR="/var/cache/real-estate-watcher"
SYSTEMD_UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

fail() {
  echo "$1" >&2
  exit 1
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    fail "Este script precisa ser executado como root."
  fi
}

validate_ubuntu_release() {
  if [[ ! -f /etc/os-release ]]; then
    fail "/etc/os-release não encontrado."
  fi

  . /etc/os-release

  local codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
  local id_like="${ID_LIKE:-}"
  if [[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]]; then
    return
  fi

  if [[ "${codename}" == "noble" && "${id_like}" == *"ubuntu"* ]]; then
    return
  fi

  fail "Este instalador suporta Ubuntu 24.04 LTS ou derivadas compatíveis (noble)."
}

validate_node() {
  if ! command -v node >/dev/null 2>&1; then
    fail "Node.js 22+ é obrigatório."
  fi

  local node_major
  node_major="$(node -p "process.versions.node.split('.')[0]")"
  if (( node_major < 22 )); then
    fail "Node.js 22+ é obrigatório. Versão atual: $(node -v)"
  fi
}

validate_corepack() {
  if ! command -v corepack >/dev/null 2>&1; then
    fail "corepack não encontrado. Instale Node.js 22+ com Corepack habilitado."
  fi
}

validate_lockfile() {
  if [[ ! -f "${REPO_DIR}/pnpm-lock.yaml" ]]; then
    fail "pnpm-lock.yaml não encontrado em ${REPO_DIR}. Rode 'corepack pnpm install' no repositório e versione o lockfile antes do deploy."
  fi
}

read_expected_pnpm_version() {
  local package_manager
  package_manager="$(
    node -p "const fs = require('node:fs'); const pkg = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); pkg.packageManager ?? ''" \
      "${APP_DIR}/package.json"
  )"

  if [[ ! "${package_manager}" =~ ^pnpm@.+$ ]]; then
    fail "package.json precisa definir packageManager no formato pnpm@<versão>."
  fi

  printf '%s\n' "${package_manager#pnpm@}"
}

prepare_pnpm() {
  local expected_pnpm_version
  expected_pnpm_version="$(read_expected_pnpm_version)"

  corepack enable
  corepack prepare "pnpm@${expected_pnpm_version}" --activate

  local installed_pnpm_version
  if command -v pnpm >/dev/null 2>&1; then
    installed_pnpm_version="$(pnpm --version)"
  else
    installed_pnpm_version="$(corepack pnpm --version)"
  fi

  if [[ "${installed_pnpm_version}" != "${expected_pnpm_version}"* ]]; then
    fail "Versão inesperada do pnpm. Esperado: ${expected_pnpm_version}. Atual: ${installed_pnpm_version}."
  fi
}

run_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$@"
    return
  fi

  corepack pnpm "$@"
}

ensure_service_account() {
  if ! getent group "${SERVICE_GROUP}" >/dev/null 2>&1; then
    groupadd --system "${SERVICE_GROUP}"
  fi

  if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
    useradd \
      --system \
      --gid "${SERVICE_GROUP}" \
      --home-dir "${STATE_DIR}" \
      --create-home \
      --shell /usr/sbin/nologin \
      "${SERVICE_USER}"
  fi
}

sync_application_code() {
  mkdir -p "${APP_DIR}"
  find "${APP_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  tar \
    --exclude=".git" \
    --exclude="node_modules" \
    --exclude="dist" \
    --exclude="data" \
    --exclude=".cache" \
    --exclude=".env" \
    --exclude=".npm-cache" \
    -C "${REPO_DIR}" \
    -cf - . | tar -C "${APP_DIR}" -xf -
}

ensure_runtime_directories() {
  mkdir -p \
    "${APP_DIR}" \
    "${ENV_DIR}" \
    "${STATE_DIR}" \
    "${STATE_DIR}/debug" \
    "${CACHE_DIR}" \
    "${CACHE_DIR}/tmp"
}

apply_runtime_permissions() {
  chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${APP_DIR}" "${STATE_DIR}" "${CACHE_DIR}"
  chown root:"${SERVICE_GROUP}" "${ENV_DIR}" "${ENV_FILE}"
  chmod 0750 "${ENV_DIR}" "${STATE_DIR}" "${STATE_DIR}/debug" "${CACHE_DIR}" "${CACHE_DIR}/tmp"
  chmod 0640 "${ENV_FILE}"
  chmod 0755 "${APP_DIR}"
}

install_dependencies_and_build() {
  cd "${APP_DIR}"

  if [[ ! -f "pnpm-lock.yaml" ]]; then
    fail "pnpm-lock.yaml não foi copiado para ${APP_DIR}. O checkout precisa estar consistente antes do deploy."
  fi

  prepare_pnpm
  run_pnpm install --frozen-lockfile
  run_pnpm build
  APP_ENV_FILE="${ENV_FILE}" NODE_ENV=production run_pnpm app install-browsers --with-deps
}

install_env_file() {
  if [[ -f "${ENV_FILE}" ]]; then
    echo "Arquivo de ambiente existente preservado: ${ENV_FILE}"
    return
  fi

  install -m 0640 "${APP_DIR}/deploy/ubuntu/real-estate-watcher.env.example" "${ENV_FILE}"
  echo "Arquivo de ambiente criado em ${ENV_FILE}. Revise TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID."
}

install_systemd_unit() {
  install -m 0644 "${APP_DIR}/deploy/ubuntu/real-estate-watcher.service" "${SYSTEMD_UNIT_PATH}"
  systemctl daemon-reload
}

print_next_steps() {
  cat <<EOF
Instalação concluída.

Próximos passos:
1. Revisar ${ENV_FILE}
2. Executar bootstrap inicial:
   sudo -u ${SERVICE_USER} -- bash -lc 'cd ${APP_DIR} && pnpm app bootstrap'
3. Validar o deploy:
   sudo ${APP_DIR}/deploy/ubuntu/post-deploy-check.sh
4. Iniciar o serviço:
   sudo systemctl enable --now ${SERVICE_NAME}
5. Acompanhar logs:
   sudo journalctl -u ${SERVICE_NAME} -f
EOF
}

main() {
  require_root
  validate_ubuntu_release
  validate_node
  validate_corepack
  validate_lockfile
  ensure_service_account
  sync_application_code
  ensure_runtime_directories
  install_env_file
  install_dependencies_and_build
  apply_runtime_permissions
  install_systemd_unit
  print_next_steps
}

main "$@"
