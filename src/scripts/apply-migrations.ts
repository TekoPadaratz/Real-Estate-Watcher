import { loadEnv } from "../core/config/env.js";
import { createDatabase } from "../core/storage/db.js";

async function main() {
  const env = loadEnv();
  const { client } = await createDatabase(env);
  client.close();
}

await main();
