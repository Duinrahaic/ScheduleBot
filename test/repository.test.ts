import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { createDatabase, ensureSchema } from "../src/database.js";
import type { NewSchedule } from "../src/domain.js";
import { Repository } from "../src/repository.js";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  ),
);

const input = (values: Partial<NewSchedule> = {}): NewSchedule => ({
  startTime: new Date("2024-01-01T00:00:00Z"),
  endTime: new Date("2024-01-01T01:00:00Z"),
  timeZone: "UTC",
  serverId: "123456789012345678",
  eventTitle: "Test",
  eventDescription: "Description",
  worldLink: null,
  hostId: "323456789012345678",
  roleId: "423456789012345678",
  hostName: "Host",
  hostUrl: "https://example.com",
  imageUrl: null,
  ...values,
});

async function sqliteRepository() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "schedulebot-"));
  directories.push(directory);
  const config: Config = {
    discordToken: "test",
    databaseType: "sqlite",
    sqliteFilename: path.join(directory, "test.sqlite3"),
    mysql: { host: "", port: 3306, database: "", user: "", password: "" },
    rolePrefix: "EventRole",
    schedulerIntervalMs: 1000,
    schedulerLeadMinutes: 60,
    cleanupDelayMinutes: 60,
    logLevel: "error",
  };
  const database = createDatabase(config);
  await ensureSchema(database, "sqlite");
  return { database, repository: new Repository(database) };
}

describe("SQLite repository", () => {
  it("round trips legacy names, snowflakes, dates, booleans, reports, and cascades", async () => {
    const { database, repository } = await sqliteRepository();
    try {
      await repository.setEventChannel(
        "123456789012345678",
        "223456789012345678",
      );
      expect(await repository.getSetting("123456789012345678")).toMatchObject({
        channelId: "223456789012345678",
      });
      const created = await repository.createSchedule(input());
      await repository.updateSchedule(created.id, {
        eventId: "18446744073709551615",
        threadId: "523456789012345678",
        isActive: true,
        hasEnded: true,
      });
      const persisted = await repository.getScheduleByMessage(
        created.serverId,
        "18446744073709551615",
      );
      expect(persisted).toMatchObject({
        eventTitle: "Test",
        eventId: "18446744073709551615",
        threadId: "523456789012345678",
        isActive: true,
        hasEnded: true,
      });
      expect(persisted?.startTime.toISOString()).toBe(
        "2024-01-01T00:00:00.000Z",
      );
      await repository.toggleAttendance(
        created.id,
        "623456789012345678",
        "User",
        "Attending",
      );
      const report = await repository.attendanceReport(
        created.serverId,
        new Date("2023-12-31T00:00:00Z"),
        new Date("2024-01-02T00:00:00Z"),
      );
      expect(report).toHaveLength(1);
      expect(report[0]?.attendance).toEqual([
        expect.objectContaining({ userId: "623456789012345678" }),
      ]);
      await repository.deleteSchedule(created.id);
      expect(await repository.listAttendance(created.id)).toEqual([]);
      expect(await database.schema.hasTable("Attenants")).toBe(true);
    } finally {
      await database.destroy();
    }
  });

  it("rejects changing channels while an unfinished event exists", async () => {
    const { database, repository } = await sqliteRepository();
    try {
      await repository.setEventChannel("1", "10");
      const created = await repository.createSchedule(
        input({ serverId: "1", eventId: "20" }),
      );
      await expect(repository.setEventChannel("1", "11")).rejects.toThrow(
        "unfinished events",
      );
      await expect(
        repository.setEventChannel("1", "10"),
      ).resolves.toBeUndefined();
      await repository.updateSchedule(created.id, { hasEnded: true });
      await expect(
        repository.setEventChannel("1", "11"),
      ).resolves.toBeUndefined();
    } finally {
      await database.destroy();
    }
  });

  it("upgrades legacy attendance duplicates deterministically and adds uniqueness", async () => {
    const { database, repository } = await sqliteRepository();
    try {
      const created = await repository.createSchedule(input());
      await database.schema.dropTable("Attenants");
      await database.schema.createTable("Attenants", (table) => {
        table.increments("Id").primary();
        table
          .integer("ScheduleId")
          .notNullable()
          .references("Id")
          .inTable("Schedules")
          .onDelete("CASCADE");
        table.text("UserId").notNullable();
        table.text("Name").notNullable();
        table.text("Status").notNullable();
        table.index("ScheduleId", "IX_Attenants_ScheduleId");
      });
      await database("Attenants").insert([
        {
          ScheduleId: created.id,
          UserId: "623456789012345678",
          Name: "Old",
          Status: "Attending",
        },
        {
          ScheduleId: created.id,
          UserId: "623456789012345678",
          Name: "New",
          Status: "Tentative",
        },
      ]);

      await ensureSchema(database, "sqlite");

      expect(await repository.listAttendance(created.id)).toEqual([
        expect.objectContaining({ name: "New", status: "Tentative" }),
      ]);
      const indexes = await database.raw<
        Array<{ name: string; unique: number }>
      >("PRAGMA index_list('Attenants')");
      expect(indexes).toContainEqual(
        expect.objectContaining({
          name: "UX_Attenants_ScheduleId_UserId",
          unique: 1,
        }),
      );
      await expect(
        database("Attenants").insert({
          ScheduleId: created.id,
          UserId: "623456789012345678",
          Name: "Duplicate",
          Status: "Attending",
        }),
      ).rejects.toThrow();
    } finally {
      await database.destroy();
    }
  });

  it("serializes concurrent attendance toggles and enforces composite uniqueness", async () => {
    const { database, repository } = await sqliteRepository();
    try {
      const created = await repository.createSchedule(input());
      const callbackOrder: string[] = [];
      await Promise.all([
        repository.updateAttendance(
          created.id,
          "623456789012345678",
          "User",
          "Attending",
          async ({ attendance }) => {
            callbackOrder.push(`first:${attendance.length}`);
            await new Promise((resolve) => setTimeout(resolve, 5));
          },
        ),
        repository.updateAttendance(
          created.id,
          "623456789012345678",
          "User",
          "Attending",
          ({ attendance }) => {
            callbackOrder.push(`second:${attendance.length}`);
            return Promise.resolve();
          },
        ),
      ]);
      expect(callbackOrder).toEqual(["first:1", "second:0"]);
      expect(await repository.listAttendance(created.id)).toEqual([]);
      const indexes = await database.raw<
        Array<{ name: string; unique: number }>
      >("PRAGMA index_list('Attenants')");
      expect(indexes).toContainEqual(
        expect.objectContaining({
          name: "UX_Attenants_ScheduleId_UserId",
          unique: 1,
        }),
      );
    } finally {
      await database.destroy();
    }
  });
});
