import type { ButtonInteraction, Interaction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { Schedule } from "../src/domain.js";
import {
  ignoreMissingDiscordResource,
  replyWithInteractionError,
} from "../src/discord/bot.js";
import { InteractionHandler } from "../src/discord/interactions.js";
import {
  componentId,
  deletionModalId,
  parseInteractionId,
} from "../src/interactions.js";
import type { Repository } from "../src/repository.js";

const schedule: Schedule = {
  id: 42,
  startTime: new Date("2026-01-01T12:00:00Z"),
  endTime: new Date("2026-01-01T13:00:00Z"),
  timeZone: "UTC",
  serverId: "123",
  eventId: "456",
  threadId: null,
  eventTitle: "Event",
  eventDescription: null,
  worldLink: null,
  hostId: "789",
  roleId: null,
  hostName: "Host",
  hostUrl: "https://example.com",
  imageUrl: null,
  isActive: false,
  hasEnded: false,
};

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("interaction identifiers", () => {
  it("round trips current identifiers", () => {
    expect(parseInteractionId(componentId("attend", 42))).toEqual({
      kind: "component",
      action: "attend",
      scheduleId: 42,
    });
    expect(parseInteractionId(deletionModalId(42))).toEqual({
      kind: "delete-confirm",
      scheduleId: 42,
    });
  });

  it.each([
    ["Accept_42", "attend"],
    ["Tentative_42", "tentative"],
    ["Delete_42", "delete"],
  ])("accepts legacy C# identifier %s", (value, action) => {
    expect(parseInteractionId(value)).toEqual({
      kind: "component",
      action,
      scheduleId: 42,
    });
  });

  it.each([
    "sb:attend:0",
    "sb:attend:1:extra",
    "accept_1",
    "Accept_0",
    "sb:unknown:1",
    "sb:delete-confirm:-1",
    "",
  ])("rejects malformed identifier %s", (value) => {
    expect(parseInteractionId(value)).toBeNull();
  });
});

describe("interaction authorization and error routing", () => {
  it("accepts a legacy attendance button only for its owning guild/message", async () => {
    const editReply = vi.fn().mockResolvedValue(undefined);
    const updateAttendance = vi.fn(
      async (
        _scheduleId: number,
        _userId: string,
        _name: string,
        _desired: string,
        apply: (value: {
          result: { status: "Attending"; changed: "added" };
          attendance: [];
        }) => Promise<void>,
      ) => {
        const update = {
          result: { status: "Attending" as const, changed: "added" as const },
          attendance: [] as [],
        };
        await apply(update);
        return update;
      },
    );
    const repository = {
      getScheduleById: vi.fn().mockResolvedValue(schedule),
      updateAttendance,
    } as unknown as Repository;
    const interaction = {
      customId: "Accept_42",
      guild: { id: "123" },
      message: { id: "456" },
      user: { id: "999", username: "User" },
      deferUpdate: vi.fn().mockResolvedValue(undefined),
      editReply,
    } as unknown as ButtonInteraction;
    await new InteractionHandler(repository, logger).button(interaction);
    expect(updateAttendance).toHaveBeenCalledWith(
      42,
      "999",
      "User",
      "Attending",
      expect.any(Function),
    );
    expect(editReply).toHaveBeenCalledOnce();
  });

  it("rejects a component whose message does not own the schedule", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const repository = {
      getScheduleById: vi.fn().mockResolvedValue(schedule),
      updateAttendance: vi.fn(),
    } as unknown as Repository;
    const interaction = {
      customId: "Accept_42",
      guild: { id: "123" },
      message: { id: "not-456" },
      reply,
    } as unknown as ButtonInteraction;
    await new InteractionHandler(repository, logger).button(interaction);
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true }),
    );
    expect(repository.updateAttendance).not.toHaveBeenCalled();
  });

  it("uses an ephemeral follow-up after deferUpdate", async () => {
    const followUp = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn();
    const interaction = {
      deferred: true,
      replied: false,
      isRepliable: () => true,
      isChatInputCommand: () => false,
      followUp,
      editReply,
    } as unknown as Interaction;
    await replyWithInteractionError(interaction, new Error("failed"));
    expect(followUp).toHaveBeenCalledWith({
      content: "Error: failed",
      ephemeral: true,
    });
    expect(editReply).not.toHaveBeenCalled();
  });

  it("treats missing Discord cleanup resources as idempotent success", async () => {
    for (const code of [10003, 10004, 10011])
      await expect(
        ignoreMissingDiscordResource(() =>
          Promise.reject(
            Object.assign(new Error("Unknown resource"), { code }),
          ),
        ),
      ).resolves.toBeUndefined();
    await expect(
      ignoreMissingDiscordResource(() =>
        Promise.reject(new Error("Discord unavailable")),
      ),
    ).rejects.toThrow("Discord unavailable");
  });

  it("preserves editReply for a deferred slash command", async () => {
    const followUp = vi.fn();
    const editReply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      deferred: true,
      replied: false,
      isRepliable: () => true,
      isChatInputCommand: () => true,
      followUp,
      editReply,
    } as unknown as Interaction;
    await replyWithInteractionError(interaction, new Error("failed"));
    expect(editReply).toHaveBeenCalledWith({
      content: "Error: failed",
      components: [],
    });
    expect(followUp).not.toHaveBeenCalled();
  });
});
