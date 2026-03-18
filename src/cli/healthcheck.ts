import { bootstrap } from "../app/bootstrap.js";
import { runHealthcheck } from "../core/health/healthcheck.js";

export async function runHealthcheckCommand() {
  const app = await bootstrap();

  try {
    const result = await runHealthcheck(app);
    process.stdout.write(
      `healthcheck ok mode=${result.runtimeMode} db=${app.env.DATABASE_PATH} bootstrap=${result.bootstrapStatus} queue_ready=${result.pendingQueue}\n`
    );
  } finally {
    await app.close();
  }
}
