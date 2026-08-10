import { describe, expect, it } from "vitest";
import type { Attendance, Schedule } from "../src/domain.js";
import { eventMessage } from "../src/discord/messages.js";

const schedule = (values: Partial<Schedule> = {}): Schedule => ({
  id: 42,
  startTime: new Date("2026-01-01T12:00:00Z"),
  endTime: new Date("2026-01-01T14:00:00Z"),
  timeZone: "UTC",
  serverId: "123456789012345678",
  eventId: "223456789012345678",
  threadId: null,
  eventTitle: "An event",
  eventDescription: "Description",
  worldLink: "https://example.com/world",
  hostId: "323456789012345678",
  roleId: "423456789012345678",
  hostName: "Host",
  hostUrl: "https://example.com/profile",
  imageUrl: null,
  isActive: false,
  hasEnded: false,
  ...values,
});

function embedSize(embed: ReturnType<typeof eventMessage>["embeds"][number]) {
  const json = embed.toJSON();
  return (
    (json.title?.length ?? 0) +
    (json.description?.length ?? 0) +
    (json.fields ?? []).reduce(
      (total, field) => total + field.name.length + field.value.length,
      0,
    )
  );
}

describe("event message rendering", () => {
  it("renders production component IDs and removes controls for ended events", () => {
    const active = eventMessage(schedule(), []);
    expect(
      active.components[0]
        ?.toJSON()
        .components.map((item) =>
          "custom_id" in item ? item.custom_id : null,
        ),
    ).toEqual(["sb:attend:42", "sb:tentative:42", "sb:delete:42"]);
    expect(
      eventMessage(schedule({ hasEnded: true }), [], false).components,
    ).toEqual([]);
  });

  it("keeps long descriptions and large attendance lists within Discord limits", () => {
    const attendance: Attendance[] = Array.from(
      { length: 500 },
      (_, index) => ({
        id: index + 1,
        scheduleId: 42,
        userId: String(100000000000000000n + BigInt(index)),
        name: `User ${index}`,
        status: index % 2 === 0 ? "Attending" : "Tentative",
      }),
    );
    const rendered = eventMessage(
      schedule({
        eventTitle: "😀".repeat(300),
        eventDescription: "Long description 😀 ".repeat(500),
        hostUrl: `https://example.com/${"x".repeat(2000)}`,
      }),
      attendance,
    );
    const json = rendered.embeds[0]?.toJSON();
    expect(json?.title?.length).toBeLessThanOrEqual(256);
    expect(json?.description?.length).toBeLessThanOrEqual(4096);
    expect(json?.fields?.every((field) => field.value.length <= 1024)).toBe(
      true,
    );
    expect(embedSize(rendered.embeds[0]!)).toBeLessThanOrEqual(6000);
    expect(
      json?.fields?.find((field) => field.name.startsWith("✅"))?.value,
    ).toMatch(/… and \d+ more$/);
  });
});
