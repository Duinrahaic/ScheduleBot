import path from "node:path";

export type DatabaseType = "mysql" | "sqlite";

export interface Config {
  discordToken: string;
  databaseType: DatabaseType;
  sqliteFilename: string;
  mysql: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  rolePrefix: string;
  schedulerIntervalMs: number;
  schedulerLeadMinutes: number;
  cleanupDelayMinutes: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseLegacyConnectionString(
  value: string | undefined,
): Partial<Config["mysql"]> {
  if (!value) return {};
  if (value.startsWith("mysql://") || value.startsWith("mysql2://")) {
    try {
      const url = new URL(value.replace(/^mysql2:/, "mysql:"));
      return {
        host: url.hostname,
        port: url.port ? Number(url.port) : 3306,
        database: url.pathname.replace(/^\//, ""),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
      };
    } catch {
      // URL errors can echo their input, including credentials. Replace them
      // with a stable message which is safe for uncaught-error logging.
      throw new Error("The legacy MySQL connection URL is malformed");
    }
  }
  const fields: Record<string, string> = {};
  for (const entry of value.split(";").filter(Boolean)) {
    const separator = entry.indexOf("=");
    if (separator > 0)
      fields[entry.slice(0, separator).trim().toLowerCase()] = entry
        .slice(separator + 1)
        .trim();
  }
  const host =
    fields["server"] ??
    fields["host"] ??
    fields["data source"] ??
    fields["address"];
  const port = fields["port"];
  const database = fields["database"] ?? fields["initial catalog"];
  const user =
    fields["user"] ?? fields["user id"] ?? fields["uid"] ?? fields["username"];
  const password = fields["password"] ?? fields["pwd"];
  return {
    ...(host ? { host } : {}),
    ...(port ? { port: Number(port) } : {}),
    ...(database ? { database } : {}),
    ...(user ? { user } : {}),
    ...(password ? { password } : {}),
  };
}

export function parseConfig(env: NodeJS.ProcessEnv): Config {
  const databaseType = (env.DATABASE_TYPE ?? "sqlite").toLowerCase();
  if (databaseType !== "mysql" && databaseType !== "sqlite") {
    throw new Error('DATABASE_TYPE must be either "mysql" or "sqlite"');
  }
  const token = env.DISCORD_BOT_TOKEN?.trim();
  if (!token) throw new Error("DISCORD_BOT_TOKEN is required");
  const legacy = parseLegacyConnectionString(
    env.DISCORD_BOT_CONNECTION_STRING ?? env.DATABASE_CONNECTION_STRING,
  );
  const port = positiveInteger(
    env.MYSQL_PORT ?? legacy.port?.toString(),
    3306,
    "MYSQL_PORT",
  );
  const logLevel = env.LOG_LEVEL ?? "info";
  if (!["debug", "info", "warn", "error"].includes(logLevel)) {
    throw new Error("LOG_LEVEL must be debug, info, warn, or error");
  }

  const mysql = {
    host: env.MYSQL_SERVER ?? env.MYSQL_HOST ?? legacy.host ?? "scheduleBot-db",
    port,
    database:
      env.MYSQL_DB ?? env.MYSQL_DATABASE ?? legacy.database ?? "ScheduleBot",
    user: env.MYSQL_USER ?? env.MYSQL_USERNAME ?? legacy.user ?? "schedulebot",
    password: env.MYSQL_USER_PW ?? env.MYSQL_PASSWORD ?? legacy.password ?? "",
  };
  if (databaseType === "mysql") {
    const placeholders = new Set([
      "change-me",
      "replace-with-a-strong-password",
      "schedulebot",
    ]);
    if (
      !mysql.password.trim() ||
      placeholders.has(mysql.password.toLowerCase())
    )
      throw new Error(
        "MySQL requires a non-placeholder MYSQL_USER_PW or MYSQL_PASSWORD",
      );
  }

  return {
    discordToken: token,
    databaseType,
    sqliteFilename: path.resolve(
      env.SQLITE_FILE ?? "./data/schedulebot.sqlite3",
    ),
    mysql,
    rolePrefix: env.DISCORD_EVENT_ROLE_PREFIX?.trim() || "EventRole",
    schedulerIntervalMs: positiveInteger(
      env.SCHEDULER_INTERVAL_MS,
      60_000,
      "SCHEDULER_INTERVAL_MS",
    ),
    schedulerLeadMinutes: positiveInteger(
      env.SCHEDULER_LEAD_MINUTES,
      60,
      "SCHEDULER_LEAD_MINUTES",
    ),
    cleanupDelayMinutes: positiveInteger(
      env.CLEANUP_DELAY_MINUTES,
      60,
      "CLEANUP_DELAY_MINUTES",
    ),
    logLevel: logLevel as Config["logLevel"],
  };
}
