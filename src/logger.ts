export type Logger = Pick<Console, "debug" | "info" | "warn" | "error">;

export function createLogger(
  level: "debug" | "info" | "warn" | "error",
): Logger {
  const levels = ["debug", "info", "warn", "error"] as const;
  const enabled = (name: (typeof levels)[number]): boolean =>
    levels.indexOf(name) >= levels.indexOf(level);
  return {
    debug: (...args: unknown[]) =>
      enabled("debug") && console.debug("[debug]", ...args),
    info: (...args: unknown[]) =>
      enabled("info") && console.info("[info]", ...args),
    warn: (...args: unknown[]) =>
      enabled("warn") && console.warn("[warn]", ...args),
    error: (...args: unknown[]) =>
      enabled("error") && console.error("[error]", ...args),
  };
}
