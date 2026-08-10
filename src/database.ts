import fs from "node:fs";
import path from "node:path";
import knex, { type Knex } from "knex";
import type { Config, DatabaseType } from "./config.js";

export function createDatabase(config: Config): Knex {
  if (config.databaseType === "sqlite") {
    fs.mkdirSync(path.dirname(config.sqliteFilename), { recursive: true });
    return knex({
      client: "sqlite3",
      connection: { filename: config.sqliteFilename },
      useNullAsDefault: true,
      pool: {
        afterCreate: (
          connection: {
            run(sql: string, callback: (error?: Error) => void): void;
          },
          done: (error: Error | null, connection: unknown) => void,
        ) =>
          connection.run("PRAGMA foreign_keys = ON", (error) =>
            done(error ?? null, connection),
          ),
      },
    });
  }
  return knex({
    client: "mysql2",
    connection: {
      host: config.mysql.host,
      port: config.mysql.port,
      database: config.mysql.database,
      user: config.mysql.user,
      password: config.mysql.password,
      timezone: "Z",
      supportBigNumbers: true,
      bigNumberStrings: true,
    },
    pool: { min: 0, max: 10 },
  });
}

async function createMySqlSchedules(db: Knex): Promise<void> {
  await db.raw(`
    CREATE TABLE \`Schedules\` (
      \`Id\` int NOT NULL AUTO_INCREMENT,
      \`StartTime\` datetime(6) NOT NULL,
      \`EndTime\` datetime(6) NOT NULL,
      \`TimeZone\` longtext NOT NULL,
      \`ServerId\` bigint unsigned NOT NULL,
      \`EventId\` bigint unsigned NOT NULL DEFAULT 0,
      \`ThreadId\` bigint unsigned NULL,
      \`EventTitle\` longtext NOT NULL,
      \`EventDescription\` longtext NULL,
      \`WorldLink\` longtext NULL,
      \`HostId\` bigint unsigned NOT NULL DEFAULT 0,
      \`RoleId\` bigint unsigned NULL,
      \`HostName\` longtext NOT NULL,
      \`HostURL\` longtext NOT NULL,
      \`ImageURL\` longtext NULL,
      \`IsActive\` tinyint(1) NOT NULL DEFAULT 0,
      \`HasEnded\` tinyint(1) NOT NULL DEFAULT 0,
      CONSTRAINT \`PK_Schedules\` PRIMARY KEY (\`Id\`)
    ) CHARACTER SET utf8mb4
  `);
}

async function createMySqlSettings(db: Knex): Promise<void> {
  await db.raw(`
    CREATE TABLE \`ServerSettings\` (
      \`Id\` int NOT NULL AUTO_INCREMENT,
      \`ServerId\` bigint unsigned NOT NULL,
      \`ChannelId\` bigint unsigned NULL,
      \`ThreadId\` bigint unsigned NULL,
      \`IsBanned\` tinyint(1) NOT NULL DEFAULT 0,
      CONSTRAINT \`PK_ServerSettings\` PRIMARY KEY (\`Id\`),
      INDEX \`IX_ServerSettings_ServerId\` (\`ServerId\`)
    ) CHARACTER SET utf8mb4
  `);
}

async function createMySqlAttendance(db: Knex): Promise<void> {
  await db.raw(`
    CREATE TABLE \`Attenants\` (
      \`Id\` int NOT NULL AUTO_INCREMENT,
      \`ScheduleId\` int NOT NULL,
      \`UserId\` bigint unsigned NOT NULL,
      \`Name\` longtext NOT NULL,
      \`Status\` longtext NOT NULL,
      CONSTRAINT \`PK_Attenants\` PRIMARY KEY (\`Id\`),
      CONSTRAINT \`FK_Attenants_Schedules_ScheduleId\`
        FOREIGN KEY (\`ScheduleId\`) REFERENCES \`Schedules\` (\`Id\`) ON DELETE CASCADE,
      INDEX \`IX_Attenants_ScheduleId\` (\`ScheduleId\`),
      UNIQUE INDEX \`UX_Attenants_ScheduleId_UserId\` (\`ScheduleId\`, \`UserId\`)
    ) CHARACTER SET utf8mb4
  `);
}

async function attendanceUniqueIndexExists(
  db: Knex,
  databaseType: DatabaseType,
): Promise<boolean> {
  if (databaseType === "sqlite") {
    const rows = await db.raw<Array<{ name: string; unique: number }>>(
      "PRAGMA index_list('Attenants')",
    );
    return rows.some(
      (row) =>
        row.name === "UX_Attenants_ScheduleId_UserId" && row.unique === 1,
    );
  }
  const [rows] = (await db.raw(
    `SELECT INDEX_NAME AS indexName
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'Attenants'
        AND index_name = 'UX_Attenants_ScheduleId_UserId'`,
  )) as [{ indexName: string }[], unknown];
  return rows.length > 0;
}

async function ensureAttendanceUniqueIndex(
  db: Knex,
  databaseType: DatabaseType,
): Promise<void> {
  if (await attendanceUniqueIndexExists(db, databaseType)) return;
  // Legacy databases did not enforce this invariant. Keep the newest response
  // for each user before adding the constraint so upgrades are deterministic.
  if (databaseType === "sqlite") {
    await db.raw(`
      DELETE FROM \`Attenants\`
       WHERE \`Id\` NOT IN (
         SELECT MAX(\`Id\`) FROM \`Attenants\` GROUP BY \`ScheduleId\`, \`UserId\`
       )
    `);
  } else {
    await db.raw(`
      DELETE older FROM \`Attenants\` older
      JOIN \`Attenants\` newer
        ON newer.\`ScheduleId\` = older.\`ScheduleId\`
       AND newer.\`UserId\` = older.\`UserId\`
       AND newer.\`Id\` > older.\`Id\`
    `);
  }
  await db.schema.alterTable("Attenants", (table) => {
    table.unique(["ScheduleId", "UserId"], {
      indexName: "UX_Attenants_ScheduleId_UserId",
    });
  });
}

export async function ensureSchema(
  db: Knex,
  databaseType: DatabaseType,
): Promise<void> {
  const sqlite = databaseType === "sqlite";
  if (!(await db.schema.hasTable("Schedules"))) {
    if (!sqlite) await createMySqlSchedules(db);
    else
      await db.schema.createTable("Schedules", (table) => {
        table.increments("Id").primary();
        table.dateTime("StartTime", { precision: 6 }).notNullable();
        table.dateTime("EndTime", { precision: 6 }).notNullable();
        table.text("TimeZone").notNullable();
        table.text("ServerId").notNullable();
        table.text("EventId").notNullable().defaultTo("0");
        table.text("ThreadId").nullable();
        table.text("EventTitle").notNullable();
        table.text("EventDescription").nullable();
        table.text("WorldLink").nullable();
        table.text("HostId").notNullable().defaultTo("0");
        table.text("RoleId").nullable();
        table.text("HostName").notNullable();
        table.text("HostURL").notNullable();
        table.text("ImageURL").nullable();
        table.boolean("IsActive").notNullable().defaultTo(false);
        table.boolean("HasEnded").notNullable().defaultTo(false);
      });
  }
  if (!(await db.schema.hasTable("ServerSettings"))) {
    if (!sqlite) await createMySqlSettings(db);
    else
      await db.schema.createTable("ServerSettings", (table) => {
        table.increments("Id").primary();
        table.text("ServerId").notNullable().index();
        table.text("ChannelId").nullable();
        table.text("ThreadId").nullable();
        table.boolean("IsBanned").notNullable().defaultTo(false);
      });
  }
  if (!(await db.schema.hasTable("Attenants"))) {
    if (!sqlite) await createMySqlAttendance(db);
    else
      await db.schema.createTable("Attenants", (table) => {
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
        table.unique(["ScheduleId", "UserId"], {
          indexName: "UX_Attenants_ScheduleId_UserId",
        });
      });
  } else {
    await ensureAttendanceUniqueIndex(db, databaseType);
  }
}
