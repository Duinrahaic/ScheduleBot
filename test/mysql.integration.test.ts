import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Knex } from "knex";
import type { Config } from "../src/config.js";
import { createDatabase, ensureSchema } from "../src/database.js";
import { Repository } from "../src/repository.js";

const enabled = process.env.RUN_MYSQL_INTEGRATION === "true";
const mysqlConfig: Config = {
  discordToken: "test",
  databaseType: "mysql",
  sqliteFilename: "unused",
  mysql: {
    host: process.env.MYSQL_TEST_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_TEST_PORT ?? 3306),
    database: process.env.MYSQL_TEST_DATABASE ?? "ScheduleBot_test",
    user: process.env.MYSQL_TEST_USER ?? "schedulebot",
    password: process.env.MYSQL_TEST_PASSWORD ?? "integration-secret",
  },
  rolePrefix: "EventRole",
  schedulerIntervalMs: 1000,
  schedulerLeadMinutes: 60,
  cleanupDelayMinutes: 60,
  logLevel: "error",
};

async function reset(db: Knex): Promise<void> {
  await db.raw("SET FOREIGN_KEY_CHECKS = 0");
  await db.schema.dropTableIfExists("Attenants");
  await db.schema.dropTableIfExists("ServerSettings");
  await db.schema.dropTableIfExists("Schedules");
  await db.raw("SET FOREIGN_KEY_CHECKS = 1");
}

describe.skipIf(!enabled)("MySQL integration", () => {
  let database: Knex;
  let secondDatabase: Knex;
  let repository: Repository;
  let secondRepository: Repository;

  beforeAll(async () => {
    database = createDatabase(mysqlConfig);
    secondDatabase = createDatabase(mysqlConfig);
    await reset(database);
    await ensureSchema(database, "mysql");
    repository = new Repository(database);
    secondRepository = new Repository(secondDatabase);
  }, 30_000);

  afterAll(async () => {
    if (database) await reset(database);
    if (secondDatabase) await secondDatabase.destroy();
    if (database) await database.destroy();
  });

  it("creates signed legacy-compatible keys and unsigned snowflake columns", async () => {
    const [columns] = (await database.raw(`
      SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND ((TABLE_NAME = 'Schedules' AND COLUMN_NAME IN ('Id', 'ServerId', 'EventId', 'ThreadId', 'HostId', 'RoleId'))
           OR (TABLE_NAME = 'Attenants' AND COLUMN_NAME IN ('Id', 'ScheduleId', 'UserId')))
    `)) as [
      Array<{ tableName: string; columnName: string; columnType: string }>,
      unknown,
    ];
    const type = (tableName: string, columnName: string) =>
      columns.find(
        (column) =>
          column.tableName === tableName && column.columnName === columnName,
      )?.columnType;
    expect(type("Schedules", "Id")).toBe("int");
    expect(type("Attenants", "ScheduleId")).toBe("int");
    for (const [tableName, columnName] of [
      ["Schedules", "ServerId"],
      ["Schedules", "EventId"],
      ["Schedules", "ThreadId"],
      ["Schedules", "HostId"],
      ["Schedules", "RoleId"],
      ["Attenants", "UserId"],
    ])
      expect(type(tableName!, columnName!)).toBe("bigint unsigned");

    const [foreignKeys] = (await database.raw(`
      SELECT CONSTRAINT_NAME AS constraintName, DELETE_RULE AS deleteRule
        FROM information_schema.referential_constraints
       WHERE constraint_schema = DATABASE()
         AND table_name = 'Attenants'
    `)) as [Array<{ constraintName: string; deleteRule: string }>, unknown];
    expect(foreignKeys).toContainEqual({
      constraintName: "FK_Attenants_Schedules_ScheduleId",
      deleteRule: "CASCADE",
    });
  });

  it("round trips snowflakes, UTC dates, booleans, attendance, and foreign keys", async () => {
    const created = await repository.createSchedule({
      startTime: new Date("2026-02-03T04:05:06.789Z"),
      endTime: new Date("2026-02-03T05:05:06.789Z"),
      timeZone: "UTC",
      serverId: "18446744073709551615",
      eventTitle: "MySQL event",
      eventDescription: "Description",
      worldLink: null,
      hostId: "18446744073709551614",
      roleId: "18446744073709551613",
      hostName: "Host",
      hostUrl: "https://example.com",
      imageUrl: null,
    });
    await repository.updateSchedule(created.id, {
      eventId: "18446744073709551612",
      threadId: "18446744073709551611",
      isActive: true,
      hasEnded: true,
    });
    await repository.toggleAttendance(
      created.id,
      "18446744073709551610",
      "User",
      "Attending",
    );
    const roundTrip = await repository.getScheduleById(created.id);
    expect(roundTrip).toMatchObject({
      serverId: "18446744073709551615",
      eventId: "18446744073709551612",
      threadId: "18446744073709551611",
      hostId: "18446744073709551614",
      roleId: "18446744073709551613",
      isActive: true,
      hasEnded: true,
    });
    expect(roundTrip?.startTime.toISOString()).toBe("2026-02-03T04:05:06.789Z");
    await expect(
      database("Attenants").insert({
        ScheduleId: created.id + 9999,
        UserId: "1",
        Name: "Invalid",
        Status: "Attending",
      }),
    ).rejects.toThrow();
    await repository.deleteSchedule(created.id);
    expect(await repository.listAttendance(created.id)).toEqual([]);
  });

  it("prevents duplicate attendance across independent repositories", async () => {
    const created = await repository.createSchedule({
      startTime: new Date("2026-02-10T00:00:00Z"),
      endTime: new Date("2026-02-10T01:00:00Z"),
      timeZone: "UTC",
      serverId: "10",
      eventTitle: "Concurrent",
      eventDescription: null,
      worldLink: null,
      hostId: "20",
      roleId: null,
      hostName: "Host",
      hostUrl: "https://example.com",
      imageUrl: null,
    });
    const results = await Promise.allSettled([
      repository.toggleAttendance(created.id, "30", "First", "Attending"),
      secondRepository.toggleAttendance(
        created.id,
        "30",
        "Second",
        "Attending",
      ),
    ]);

    expect(results.some(({ status }) => status === "fulfilled")).toBe(true);
    const rows = await database("Attenants")
      .where({ ScheduleId: created.id, UserId: "30" })
      .select();
    expect(rows.length).toBeLessThanOrEqual(1);
    const [indexes] = (await database.raw(`
      SELECT NON_UNIQUE AS nonUnique
        FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'Attenants'
         AND index_name = 'UX_Attenants_ScheduleId_UserId'
    `)) as [Array<{ nonUnique: number | string }>, unknown];
    expect(indexes.length).toBeGreaterThan(0);
    expect(indexes.every(({ nonUnique }) => Number(nonUnique) === 0)).toBe(
      true,
    );
  });

  it("upgrades a legacy-compatible attendance table by deduplicating and adding uniqueness", async () => {
    const created = await repository.createSchedule({
      startTime: new Date("2026-03-01T00:00:00Z"),
      endTime: new Date("2026-03-01T01:00:00Z"),
      timeZone: "UTC",
      serverId: "1",
      eventTitle: "Legacy",
      eventDescription: null,
      worldLink: null,
      hostId: "2",
      roleId: null,
      hostName: "Host",
      hostUrl: "https://example.com",
      imageUrl: null,
    });
    await database.schema.dropTable("Attenants");
    await database.raw(`
      CREATE TABLE \`Attenants\` (
        \`Id\` int NOT NULL AUTO_INCREMENT,
        \`ScheduleId\` int NOT NULL,
        \`UserId\` bigint unsigned NOT NULL,
        \`Name\` longtext NOT NULL,
        \`Status\` longtext NOT NULL,
        CONSTRAINT \`PK_Attenants\` PRIMARY KEY (\`Id\`),
        CONSTRAINT \`FK_Attenants_Schedules_ScheduleId\`
          FOREIGN KEY (\`ScheduleId\`) REFERENCES \`Schedules\` (\`Id\`) ON DELETE CASCADE,
        INDEX \`IX_Attenants_ScheduleId\` (\`ScheduleId\`)
      ) CHARACTER SET utf8mb4
    `);
    await database("Attenants").insert([
      { ScheduleId: created.id, UserId: "3", Name: "Old", Status: "Attending" },
      { ScheduleId: created.id, UserId: "3", Name: "New", Status: "Tentative" },
    ]);
    await ensureSchema(database, "mysql");
    expect(await repository.listAttendance(created.id)).toEqual([
      expect.objectContaining({ name: "New", status: "Tentative" }),
    ]);
    await expect(
      database("Attenants").insert({
        ScheduleId: created.id,
        UserId: "3",
        Name: "Duplicate",
        Status: "Attending",
      }),
    ).rejects.toThrow();
  });
});
