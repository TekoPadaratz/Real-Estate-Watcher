import { bootstrap } from "../app/bootstrap.js";

export async function runNotifyTestCommand() {
  const app = await bootstrap();

  try {
    await app.telegramService.sendTestMessage();
    app.logger.info("Notificação de teste enviada.");
  } finally {
    await app.close();
  }
}
