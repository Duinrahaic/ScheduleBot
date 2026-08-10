import { describe, expect, it } from "vitest";
import {
  discordTimestamp,
  formatDuration,
  googleCalendarUrl,
  isHttpUrl,
  parseDurationHours,
  parseEventDate,
} from "../src/time.js";

describe("date and presentation formatting", () => {
  it("parses Discord and zoned ISO timestamps", () => {
    expect(parseEventDate("<t:1704067200:F>").toISOString()).toBe(
      "2024-01-01T00:00:00.000Z",
    );
    expect(
      parseEventDate("2024-01-01T12:00:00", "America/New_York").toISOString(),
    ).toBe("2024-01-01T17:00:00.000Z");
  });

  it("formats durations and Discord timestamps", () => {
    const start = new Date("2024-01-01T00:00:00Z");
    const end = new Date("2024-01-01T01:30:00Z");
    expect(formatDuration(start, end)).toBe("1 hour 30 minutes");
    expect(discordTimestamp(start, "R")).toBe("<t:1704067200:R>");
    expect(parseDurationHours(1.5)).toBe(5_400_000);
  });

  it("builds an encoded Google Calendar URL", () => {
    const url = new URL(
      googleCalendarUrl(
        "A & B",
        new Date("2024-01-01T00:00:00Z"),
        new Date("2024-01-01T01:00:00Z"),
        "Details",
      ),
    );
    expect(url.searchParams.get("text")).toBe("A & B");
    expect(url.searchParams.get("dates")).toBe(
      "20240101T000000Z/20240101T010000Z",
    );
  });

  it("rejects bad date/duration/URLs", () => {
    expect(() => parseEventDate("tomorrow-ish")).toThrow("Invalid date/time");
    expect(() => parseDurationHours(0)).toThrow("Duration");
    expect(() => formatDuration(new Date(1), new Date(0))).toThrow("after");
    expect(isHttpUrl("https://example.com")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
  });
});
