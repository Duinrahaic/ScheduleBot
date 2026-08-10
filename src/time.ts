import { DateTime } from "luxon";

const DISCORD_TIMESTAMP = /^<t:(\d{1,12})(?::[tTdDfFR])?>$/;

export function parseEventDate(input: string, zone = "UTC"): Date {
  const discord = DISCORD_TIMESTAMP.exec(input.trim());
  if (discord?.[1]) return new Date(Number(discord[1]) * 1000);
  const parsed = DateTime.fromISO(input.trim(), { zone });
  if (!parsed.isValid)
    throw new Error(`Invalid date/time: ${parsed.invalidExplanation ?? input}`);
  return parsed.toUTC().toJSDate();
}

export function parseDurationHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 14)
    throw new Error(
      "Duration must be greater than 0 and no more than 336 hours",
    );
  return Math.round(hours * 60 * 60 * 1000);
}

export function discordTimestamp(
  date: Date,
  style: "t" | "T" | "d" | "D" | "f" | "F" | "R" = "F",
): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

export function formatDuration(start: Date, end: Date): string {
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  if (minutes <= 0) throw new Error("Event end must be after its start");
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return [
    hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "",
    remaining ? `${remaining} minute${remaining === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function googleCalendarUrl(
  title: string,
  start: Date,
  end: Date,
  description?: string | null,
): string {
  const compact = (date: Date): string =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${compact(start)}/${compact(end)}`,
  });
  if (description) query.set("details", description);
  return `https://calendar.google.com/calendar/render?${query.toString()}`;
}

export function isHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
