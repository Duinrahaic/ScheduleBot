import type { ChatInputCommandInteraction, Guild } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config.js";
import type { Schedule } from "../src/domain.js";
import { CommandHandler } from "../src/discord/commands.js";
import type { Repository } from "../src/repository.js";

const config: Config = {
  discordToken: "test",
  databaseType: "sqlite",
  sqliteFilename: "test.sqlite3",
  mysql: { host: "", port: 3306, database: "", user: "", password: "" },
  rolePrefix: "EventRole",
  schedulerIntervalMs: 1000,
  schedulerLeadMinutes: 60,
  cleanupDelayMinutes: 60,
  logLevel: "error",
};
const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
const schedule: Schedule = {
  id: 1,
  startTime: new Date("2026-01-01T12:00:00Z"),
  endTime: new Date("2026-01-01T13:00:00Z"),
  timeZone: "UTC",
  serverId: "123",
  eventId: "123456789012345678",
  threadId: null,
  eventTitle: "Event",
  eventDescription: "Description",
  worldLink: null,
  hostId: "789",
  roleId: "10",
  hostName: "Host",
  hostUrl: "https://example.com",
  imageUrl: null,
  isActive: false,
  hasEnded: false,
};

describe("command transitions", () => {
  it("rejects restarting an event that has not ended", async () => {
    const repository = {
      getScheduleByMessage: vi.fn().mockResolvedValue(schedule),
    } as unknown as Repository;
    const interaction = {
      guild: { id: "123" },
      commandName: "restartevent",
      deferReply: vi.fn().mockResolvedValue(undefined),
      options: {
        getString: vi.fn().mockReturnValue("123456789012345678"),
      },
    } as unknown as ChatInputCommandInteraction;
    await expect(
      new CommandHandler(repository, config, logger).handle(interaction),
    ).rejects.toThrow("Only an ended event");
  });

  it("deletes a sent event message when storing its ID fails", async () => {
    const message = {
      id: "223456789012345678",
      url: "https://discord.test/message",
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const channel = {
      id: "456",
      isTextBased: () => true,
      isSendable: () => true,
      isDMBased: () => false,
      send: vi.fn().mockResolvedValue(message),
    };
    const role = {
      id: "10",
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const guild = {
      id: "123",
      channels: { fetch: vi.fn().mockResolvedValue(channel) },
      roles: {
        fetch: vi.fn().mockResolvedValue(undefined),
        cache: { some: () => false },
        create: vi.fn().mockResolvedValue(role),
      },
    } as unknown as Guild;
    const repository = {
      getSetting: vi.fn().mockResolvedValue({ channelId: "456" }),
      createSchedule: vi.fn().mockResolvedValue(schedule),
      updateSchedule: vi.fn().mockRejectedValue(new Error("write failed")),
      deleteSchedule: vi.fn().mockResolvedValue(undefined),
    } as unknown as Repository;
    const strings: Record<string, string | null> = {
      timezone: null,
      start: "2026-01-01T12:00:00Z",
      profile_url: "https://example.com",
      world_url: null,
      image_url: null,
      name: "Event",
      description: "Description",
    };
    const interaction = {
      guild,
      commandName: "event",
      user: { id: "789", username: "Host", bot: false },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn(),
      options: {
        getString: vi.fn((name: string) => strings[name] ?? null),
        getNumber: vi.fn().mockReturnValue(1),
        getUser: vi.fn().mockReturnValue(null),
      },
    } as unknown as ChatInputCommandInteraction;
    await expect(
      new CommandHandler(repository, config, logger).handle(interaction),
    ).rejects.toThrow("write failed");
    expect(message.delete).toHaveBeenCalledOnce();
    expect(repository.deleteSchedule).toHaveBeenCalledWith(schedule.id);
    expect(role.delete).toHaveBeenCalledOnce();
  });
});
