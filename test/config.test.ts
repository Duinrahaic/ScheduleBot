import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

const base = { DISCORD_BOT_TOKEN: "token" };

describe("configuration", () => {
  it("defaults to SQLite without exposing server credentials", () => {
    const config = parseConfig(base);
    expect(config.databaseType).toBe("sqlite");
    expect(config.sqliteFilename).toMatch(/schedulebot\.sqlite3$/);
    expect(config.rolePrefix).toBe("EventRole");
  });

  it("preserves legacy MySQL variables and common connection aliases", () => {
    const config = parseConfig({
      ...base,
      DATABASE_TYPE: "mysql",
      DATABASE_CONNECTION_STRING:
        "Data Source=legacy;User Id=old;Pwd=secret;Initial Catalog=events;",
      MYSQL_USERNAME: "override",
    });
    expect(config.mysql).toMatchObject({
      host: "legacy",
      database: "events",
      user: "override",
      password: "secret",
    });
  });

  it("sanitizes malformed legacy URL errors without retaining credentials", () => {
    const secret = "super-secret-password";
    const input = `mysql://user:${secret}@[invalid-host/database`;
    let thrown: unknown;
    try {
      parseConfig({ ...base, DISCORD_BOT_CONNECTION_STRING: input });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).toContain("connection URL is malformed");
    expect(String(thrown)).not.toContain(secret);
    expect(String(thrown)).not.toContain(input);
  });

  it.each([undefined, "", "change-me", "replace-with-a-strong-password"])(
    "rejects a missing or placeholder MySQL password (%s)",
    (password) => {
      expect(() =>
        parseConfig({
          ...base,
          DATABASE_TYPE: "mysql",
          ...(password === undefined ? {} : { MYSQL_USER_PW: password }),
        }),
      ).toThrow("non-placeholder");
    },
  );

  it.each([
    [{}, "DISCORD_BOT_TOKEN"],
    [{ ...base, DATABASE_TYPE: "postgres" }, "DATABASE_TYPE"],
    [{ ...base, MYSQL_PORT: "nope" }, "MYSQL_PORT"],
    [{ ...base, LOG_LEVEL: "verbose" }, "LOG_LEVEL"],
  ])("rejects invalid values", (environment, message) => {
    expect(() => parseConfig(environment)).toThrow(message);
  });
});
