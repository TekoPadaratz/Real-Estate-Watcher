#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="real-estate-watcher"
SERVICE_USER="realestate"
SERVICE_GROUP="realestate"
APP_DIR="/opt/real-estate-watcher"
ENV_FILE="/etc/real-estate-watcher/real-estate-watcher.env"

fail() {
  echo "$1" >&2
  exit 1
}

require_env_file() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    fail "Arquivo de ambiente não encontrado: ${ENV_FILE}"
  fi
}

load_env_file() {
  set -a
  . "${ENV_FILE}"
  set +a
}

validate_node() {
  if ! command -v node >/dev/null 2>&1; then
    fail "Node.js não encontrado."
  fi

  local node_major
  node_major="$(node -p "process.versions.node.split('.')[0]")"
  if (( node_major < 22 )); then
    fail "Node.js 22+ é obrigatório. Versão atual: $(node -v)"
  fi
}

validate_corepack() {
  if ! command -v corepack >/dev/null 2>&1; then
    fail "corepack não encontrado."
  fi
}

validate_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    return
  fi

  if corepack pnpm --version >/dev/null 2>&1; then
    return
  fi

  fail "pnpm não está disponível nem via PATH nem via corepack. Rode novamente o instalador Ubuntu para preparar o ambiente."
}

print_versions() {
  echo "Node: $(node -v)"
  echo "Corepack: $(corepack --version)"
  echo "pnpm: $(run_pnpm --version)"
}

run_app_command() {
  local subcommand="$1"
  runuser -u "${SERVICE_USER}" -- bash -lc "cd '${APP_DIR}' && APP_ENV_FILE='${ENV_FILE}' $(printf '%q ' "${PNPM_RUNNER[@]}")app ${subcommand}"
}

run_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$@"
    return
  fi

  corepack pnpm "$@"
}

database_path_from_url() {
  local url="${DATABASE_URL:-}"
  if [[ "${url}" != file:* ]]; then
    fail "DATABASE_URL inválida: ${url}"
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
    fail "Diretório de browsers do Playwright não encontrado: ${PLAYWRIGHT_BROWSERS_PATH}"
  fi

  if [[ -z "$(find "${PLAYWRIGHT_BROWSERS_PATH}" -mindepth 1 -maxdepth 1 2>/dev/null)" ]]; then
    fail "Nenhum browser instalado em ${PLAYWRIGHT_BROWSERS_PATH}"
  fi
}

run_app_checks() {
  cd "${APP_DIR}"
  run_app_command "healthcheck"
  run_app_command "source-check"

  if [[ "${RUN_NOTIFY_TEST:-0}" == "1" ]]; then
    run_app_command "notify-test"
  fi
}

print_summary() {
  cat <<EOF
Post-deploy check concluído.
- Env carregado de ${ENV_FILE}
- Node: $(node -v)
- pnpm: $(run_pnpm --version)
- Serviço esperado: ${SERVICE_NAME}
- Diretórios validados: ${APP_DATA_DIR}, ${APP_CACHE_DIR}, ${APP_DEBUG_DIR}
EOF
}

main() {
  require_env_file
  load_env_file
  validate_node
  validate_corepack
  validate_pnpm
  print_versions
  validate_runtime_paths
  validate_playwright_install
  run_app_checks
  print_summary
}

if command -v pnpm >/dev/null 2>&1; then
  PNPM_RUNNER=("pnpm")
else
  PNPM_RUNNER=("corepack" "pnpm")
fi

main "$@"
