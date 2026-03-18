#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="real-estate-watcher"
SERVICE_USER="realestate"
SERVICE_GROUP="realestate"
APP_DIR="/opt/real-estate-watcher"
ENV_FILE="/etc/real-estate-watcher/real-estate-watcher.env"

require_env_file() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "Arquivo de ambiente não encontrado: ${ENV_FILE}" >&2
    exit 1
  fi
}

load_env_file() {
  set -a
  . "${ENV_FILE}"
  set +a
}

validate_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js não encontrado." >&2
    exit 1
  fi

  local node_major
  node_major="$(node -p "process.versions.node.split('.')[0]")"
  if (( node_major < 22 )); then
    echo "Node.js 22+ é obrigatório. Versão atual: $(node -v)" >&2
    exit 1
  fi
}

database_path_from_url() {
  local url="${DATABASE_URL:-}"
  if [[ "${url}" != file:* ]]; then
    echo "DATABASE_URL inválida: ${url}" >&2
    exit 1
  fi

  printf '%s\n' "${url#file:}"
}

assert_realestate_can_write() {
  local directory="$1"
  local probe_file="${directory}/.post-deploy-check.$$"
  runuser -u "${SERVICE_USER}" -- bash -lc "mkdir -p '${directory}' && : > '${probe_file}' && rm -f '${probe_file}'"
}

validate_runtime_paths() {
  local database_path
  database_path="$(database_path_from_url)"

  echo "Validando env: ${ENV_FILE}"
  echo "Validando database path: ${database_path}"

  assert_realestate_can_write "${APP_DATA_DIR}"
  assert_realestate_can_write "${APP_CACHE_DIR}"
  assert_realestate_can_write "${APP_DEBUG_DIR}"

  mkdir -p "$(dirname "${database_path}")"
  chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${APP_DATA_DIR}" "${APP_CACHE_DIR}" >/dev/null 2>&1 || true
}

validate_playwright_install() {
  if [[ ! -d "${PLAYWRIGHT_BROWSERS_PATH}" ]]; then
    echo "Diretório de browsers do Playwright não encontrado: ${PLAYWRIGHT_BROWSERS_PATH}" >&2
    exit 1
  fi

  if [[ -z "$(find "${PLAYWRIGHT_BROWSERS_PATH}" -mindepth 1 -maxdepth 1 2>/dev/null)" ]]; then
    echo "Nenhum browser instalado em ${PLAYWRIGHT_BROWSERS_PATH}" >&2
    exit 1
  fi
}

run_app_checks() {
  cd "${APP_DIR}"
  runuser -u "${SERVICE_USER}" -- bash -lc "cd '${APP_DIR}' && node dist/src/index.js healthcheck"
  runuser -u "${SERVICE_USER}" -- bash -lc "cd '${APP_DIR}' && node dist/src/index.js source-check"

  if [[ "${RUN_NOTIFY_TEST:-0}" == "1" ]]; then
    runuser -u "${SERVICE_USER}" -- bash -lc "cd '${APP_DIR}' && node dist/src/index.js notify-test"
  fi
}

print_summary() {
  cat <<EOF
Post-deploy check concluído.
- Env carregado de ${ENV_FILE}
- Node: $(node -v)
- Serviço esperado: ${SERVICE_NAME}
- Diretórios validados: ${APP_DATA_DIR}, ${APP_CACHE_DIR}, ${APP_DEBUG_DIR}
EOF
}

main() {
  require_env_file
  load_env_file
  validate_node
  validate_runtime_paths
  validate_playwright_install
  run_app_checks
  print_summary
}

main "$@"
