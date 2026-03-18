# real-estate-watcher

Watcher de imóveis em TypeScript + Node.js com SQLite/Drizzle, scraping SSR e JS-first, fila durável de notificações e operação contínua em Ubuntu Server 24.04 LTS com `systemd`.

## Stack

- TypeScript + Node.js 22
- SQLite + Drizzle ORM
- Playwright para fontes browser-first
- got + cheerio para fontes SSR
- pino para logs estruturados
- zod para validação
- YAML para configuração
- `.env` para segredos
- vitest para testes

## Modos

- `bootstrap`: persiste todo o backlog atual, cria snapshots, enfileira `initial` e só marca `bootstrap_status=completed` quando a fila inicial termina.
- `watch`: roda scans periódicos e só enfileira `new_listing`, `price_drop` e `updated`.
- `run-service`: sobe scheduler + dispatcher contínuo para operação 24/7.

## Layout de produção no Ubuntu

- Código: `/opt/real-estate-watcher`
- Env: `/etc/real-estate-watcher/real-estate-watcher.env`
- Estado persistente: `/var/lib/real-estate-watcher`
- Debug, screenshots e artifacts: `/var/lib/real-estate-watcher/debug`
- Cache temporário: `/var/cache/real-estate-watcher`

Os paths são centralizados em `src/core/config/runtime-paths.ts` e podem ser sobrescritos via variáveis de ambiente.

## CLI operacional

Depois do build:

```bash
pnpm app bootstrap
pnpm app watch
pnpm app run-service
pnpm app source-check
pnpm app smoke-test
pnpm app notify-test
pnpm app healthcheck
pnpm app install-browsers
```

Equivalentes diretos:

```bash
node dist/src/index.js bootstrap
node dist/src/index.js watch
node dist/src/index.js run-service
node dist/src/index.js source-check
node dist/src/index.js smoke-test
node dist/src/index.js notify-test
node dist/src/index.js healthcheck
node dist/src/index.js install-browsers
```

## Local / Dev

Env local:

```bash
cp .env.example .env
```

Build:

```bash
npm install
npm run build
```

Execução local:

```bash
pnpm app bootstrap
pnpm app watch --interval 30
pnpm app source-check
pnpm app healthcheck
```

Smoke test ao vivo:

```bash
ENABLE_LIVE_SMOKE=true npm test -- tests/smoke/live-sources.test.ts
```

## Ubuntu 24.04

### Requisitos

- Ubuntu Server 24.04 LTS
- Node.js 22+
- acesso sudo/root
- Telegram bot token e chat id

### Setup em um comando

Do checkout do projeto:

```bash
sudo ./deploy/ubuntu/install-ubuntu-24.04.sh
```

O script:

- valida Ubuntu 24.04
- valida Node 22+
- habilita `corepack`
- instala dependências
- roda build
- instala Playwright + dependências Linux
- cria usuário/grupo `realestate`
- prepara `/opt`, `/etc`, `/var/lib` e `/var/cache`
- instala o unit do `systemd`
- executa `daemon-reload`

### Configuração do env

Exemplo de produção:

- `deploy/ubuntu/real-estate-watcher.env.example`

Instalação padrão:

- `/etc/real-estate-watcher/real-estate-watcher.env`

Variáveis principais:

- `NODE_ENV=production`
- `TZ=America/Sao_Paulo`
- `APP_DATA_DIR=/var/lib/real-estate-watcher`
- `APP_CACHE_DIR=/var/cache/real-estate-watcher`
- `APP_DEBUG_DIR=/var/lib/real-estate-watcher/debug`
- `DATABASE_URL=file:/var/lib/real-estate-watcher/app.db`
- `PLAYWRIGHT_BROWSERS_PATH=/var/lib/real-estate-watcher/pw-browsers`
- `TELEGRAM_BOT_TOKEN=`
- `TELEGRAM_CHAT_ID=`
- `BOOTSTRAP_ON_START=false`

Se `BOOTSTRAP_ON_START=false`, o serviço não executa bootstrap automaticamente e falha até que você rode o bootstrap manualmente.

### Migrations / banco

O schema SQLite é aplicado automaticamente na abertura do banco. Se quiser forçar a criação do banco antes do serviço:

```bash
cd /opt/real-estate-watcher
node dist/src/scripts/apply-migrations.js
```

Características de produção:

- SQLite em WAL
- `busy_timeout=5000`
- diretório do banco criado automaticamente
- `DATABASE_URL` obrigatoriamente em formato `file:...`

### Instalação de browsers do Playwright

Com o app já buildado:

```bash
pnpm app install-browsers --with-deps
```

O caminho dos browsers é controlado por `PLAYWRIGHT_BROWSERS_PATH`.

### Bootstrap inicial

Execute uma vez antes de habilitar o serviço, ou defina `BOOTSTRAP_ON_START=true`.

```bash
sudo -u realestate -- bash -lc 'cd /opt/real-estate-watcher && node dist/src/index.js bootstrap'
```

### Healthcheck e pós-deploy

Healthcheck curto:

```bash
sudo -u realestate -- bash -lc 'cd /opt/real-estate-watcher && node dist/src/index.js healthcheck'
```

Check completo pós-deploy:

```bash
sudo /opt/real-estate-watcher/deploy/ubuntu/post-deploy-check.sh
```

Opcionalmente com teste de notificação:

```bash
sudo RUN_NOTIFY_TEST=1 /opt/real-estate-watcher/deploy/ubuntu/post-deploy-check.sh
```

### Serviço systemd

Unit:

- `deploy/ubuntu/real-estate-watcher.service`

Habilitar e iniciar:

```bash
sudo systemctl enable --now real-estate-watcher
```

Operações manuais:

```bash
sudo systemctl status real-estate-watcher
sudo systemctl restart real-estate-watcher
sudo systemctl stop real-estate-watcher
sudo systemctl start real-estate-watcher
```

Logs:

```bash
sudo journalctl -u real-estate-watcher -f
sudo journalctl -u real-estate-watcher --since today
```

## Operação contínua

Fluxo esperado:

1. `bootstrap` persiste backlog e enfileira `initial`.
2. O dispatcher envia 1 mensagem a cada 6 segundos, com dedupe por `payload_hash`.
3. Apenas envios com sucesso entram em `notifications`.
4. Após o bootstrap, `watch`/`run-service` enfileiram apenas `new_listing`, `price_drop` e `updated`.

Prioridades da fila:

- `new_listing = 100`
- `price_drop = 90`
- `updated = 80`
- `initial = 50`

## Backup do SQLite

Backup simples com o serviço parado:

```bash
sudo systemctl stop real-estate-watcher
sudo cp /var/lib/real-estate-watcher/app.db /var/lib/real-estate-watcher/app.db.backup
sudo systemctl start real-estate-watcher
```

Backup consistente com `sqlite3`:

```bash
sudo sqlite3 /var/lib/real-estate-watcher/app.db ".backup '/var/lib/real-estate-watcher/app-$(date +%F-%H%M%S).db'"
```

## Atualização do projeto

Do checkout atualizado do projeto:

```bash
sudo ./deploy/ubuntu/install-ubuntu-24.04.sh
sudo /opt/real-estate-watcher/deploy/ubuntu/post-deploy-check.sh
sudo systemctl restart real-estate-watcher
```

## Troubleshooting

Playwright:

- Rode `pnpm app install-browsers --with-deps` novamente.
- Verifique `PLAYWRIGHT_BROWSERS_PATH`.
- Confira se `APP_DEBUG_DIR` está gravável pelo usuário `realestate`.

Telegram:

- Valide `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` no env.
- Rode `pnpm app notify-test`.
- Verifique `journalctl -u real-estate-watcher -f` para `429`, fallback de foto e retries.

Bootstrap:

- Se `run-service` falhar com bootstrap pendente, rode `pnpm app bootstrap` ou ajuste `BOOTSTRAP_ON_START=true`.

SQLite:

- Confirme `DATABASE_URL=file:/var/lib/real-estate-watcher/app.db`.
- Verifique permissões de escrita em `/var/lib/real-estate-watcher`.

## Testes

```bash
npm run build
npm test
```

Cobertura adicionada para:

- runtime paths Linux
- parsing do env de produção
- healthcheck
- fallback seguro de diretórios
- deploy assets Ubuntu
- rate limiter 10/min
- `retry_after`
- dedupe da fila
- bootstrap status
- enqueue de `initial`, `new_listing` e `price_drop`
- fallback `sendPhoto -> sendMessage`
