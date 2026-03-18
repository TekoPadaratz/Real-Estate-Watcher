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

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Este script precisa ser executado como root." >&2
    exit 1
  fi
}

validate_ubuntu_release() {
  if [[ ! -f /etc/os-release ]]; then
    echo "/etc/os-release não encontrado." >&2
    exit 1
  fi

  . /etc/os-release

  if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "24.04" ]]; then
    echo "Este instalador suporta apenas Ubuntu 24.04 LTS." >&2
    exit 1
  fi
}

validate_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js 22+ é obrigatório." >&2
    exit 1
  fi

  local node_major
  node_major="$(node -p "process.versions.node.split('.')[0]")"
  if (( node_major < 22 )); then
    echo "Node.js 22+ é obrigatório. Versão atual: $(node -v)" >&2
    exit 1
  fi
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

install_dependencies_and_build() {
  cd "${APP_DIR}"
  corepack enable
  corepack prepare pnpm@10.6.4 --activate
  npm ci
  npm run build
  node dist/src/index.js install-browsers --with-deps
}

ensure_runtime_directories() {
  mkdir -p "${ENV_DIR}" "${STATE_DIR}" "${STATE_DIR}/debug" "${CACHE_DIR}"
  chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${APP_DIR}" "${STATE_DIR}" "${CACHE_DIR}"
  chmod 0750 "${STATE_DIR}" "${STATE_DIR}/debug" "${CACHE_DIR}"
  chmod 0755 "${APP_DIR}"
}

install_env_file() {
  if [[ -f "${ENV_FILE}" ]]; then
    echo "Arquivo de ambiente existente preservado: ${ENV_FILE}"
    return
  fi

  install -m 0640 "${APP_DIR}/deploy/ubuntu/real-estate-watcher.env.example" "${ENV_FILE}"
  chown root:"${SERVICE_GROUP}" "${ENV_FILE}"
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
   sudo -u ${SERVICE_USER} -- bash -lc 'cd ${APP_DIR} && node dist/src/index.js bootstrap'
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
  ensure_service_account
  sync_application_code
  install_dependencies_and_build
  ensure_runtime_directories
  install_env_file
  install_systemd_unit
  print_next_steps
}

main "$@"
