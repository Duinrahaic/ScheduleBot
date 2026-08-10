import "dotenv/config";
import http from "node:http";
import { parseConfig } from "./config.js";
import { createDatabase, ensureSchema } from "./database.js";
import { ScheduleBot } from "./discord/bot.js";
import { createLogger } from "./logger.js";
import { Repository } from "./repository.js";

const config = parseConfig(process.env);
const logger = createLogger(config.logLevel);
const database = createDatabase(config);
const repository = new Repository(database);
const bot = new ScheduleBot(repository, config, logger);
let stopping = false;

const healthServer = http.createServer((request, response) => {
  if (request.url !== "/health") {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(bot.isReady() ? 200 : 503, {
    "content-type": "application/json",
  });
  response.end(JSON.stringify({ ready: bot.isReady() }));
});

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info(`Received ${signal}; shutting down`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  healthServer.close();
  await bot.stop();
  await database.destroy();
  clearTimeout(force);
}

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void shutdown(signal).catch((error: unknown) => {
      logger.error("Graceful shutdown failed", error);
      process.exitCode = 1;
    });
  });

try {
  await ensureSchema(database, config.databaseType);
  logger.info(`Database ready (${config.databaseType})`);
  healthServer.listen(Number(process.env.HEALTH_PORT ?? 3000), "0.0.0.0");
  await bot.start();
} catch (error) {
  logger.error("Fatal startup error", error);
  await shutdown("startup failure");
  process.exitCode = 1;
}
