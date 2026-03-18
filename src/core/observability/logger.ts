import pino, { type LoggerOptions } from "pino";
import type { AppEnv } from "../config/env.js";

export function createLogger(env: AppEnv) {
  const options: LoggerOptions = {
    level: env.LOG_LEVEL,
    base: {
      service: "real-estate-watcher"
    }
  };

  return pino(options);
}
