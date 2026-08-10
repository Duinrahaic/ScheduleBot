import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type APIEmbedField,
} from "discord.js";
import type { Attendance, Schedule } from "../domain.js";
import { componentId } from "../interactions.js";
import {
  discordTimestamp,
  formatDuration,
  googleCalendarUrl,
} from "../time.js";

const EMBED_DESCRIPTION_LIMIT = 2000;
const EMBED_FIELD_LIMIT = 1024;

function truncateWhole(value: string, limit: number): string {
  if (value.length <= limit) return value;
  let result = "";
  for (const character of value) {
    if (result.length + character.length + 1 > limit) break;
    result += character;
  }
  return `${result}…`;
}

function mentions(
  attendance: Attendance[],
  status: Attendance["status"],
): string {
  const values = attendance
    .filter((item) => item.status === status)
    .map((item) => `<@${item.userId}>`);
  if (values.length === 0) return "\u200b";
  const rendered: string[] = [];
  for (const value of values) {
    const separator = rendered.length === 0 ? "" : "\n";
    if (
      rendered.join("\n").length + separator.length + value.length >
      EMBED_FIELD_LIMIT
    )
      break;
    rendered.push(value);
  }
  const omitted = values.length - rendered.length;
  if (omitted > 0) {
    const suffix = `… and ${omitted} more`;
    while (
      rendered.length > 0 &&
      `${rendered.join("\n")}\n${suffix}`.length > EMBED_FIELD_LIMIT
    )
      rendered.pop();
    return rendered.length > 0 ? `${rendered.join("\n")}\n${suffix}` : suffix;
  }
  return rendered.join("\n");
}

function calendarField(schedule: Schedule): APIEmbedField {
  let title = truncateWhole(schedule.eventTitle, 256);
  while (title.length > 1) {
    const url = googleCalendarUrl(title, schedule.startTime, schedule.endTime);
    const value = `[Add to Calendar](${url})`;
    if (value.length <= EMBED_FIELD_LIMIT)
      return { name: "Google Calendar", value };
    title = truncateWhole(title, Math.max(1, title.length - 16));
  }
  return { name: "Google Calendar", value: "Calendar link is unavailable." };
}

function profileField(hostUrl: string): APIEmbedField {
  const value = `[Open profile](${hostUrl})`;
  return {
    name: "Profile",
    value:
      value.length <= EMBED_FIELD_LIMIT
        ? value
        : "Profile URL is too long to display.",
    inline: true,
  };
}

export interface EventMessageOptions {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

export function eventMessage(
  schedule: Schedule,
  attendance: Attendance[],
  interactive = true,
): EventMessageOptions {
  const attending = attendance.filter(
    (item) => item.status === "Attending",
  ).length;
  const tentative = attendance.filter(
    (item) => item.status === "Tentative",
  ).length;
  const embed = new EmbedBuilder()
    .setTitle(truncateWhole(schedule.eventTitle, 256))
    .setDescription(
      schedule.eventDescription
        ? truncateWhole(schedule.eventDescription, EMBED_DESCRIPTION_LIMIT)
        : null,
    )
    .addFields(
      {
        name: "Event Occurs",
        value: interactive
          ? `${discordTimestamp(schedule.startTime)} (${discordTimestamp(schedule.startTime, "R")})\nDuration: ${formatDuration(schedule.startTime, schedule.endTime)}`
          : `${discordTimestamp(schedule.startTime)}\nEnded`,
      },
      calendarField(schedule),
      ...(schedule.hostId !== "0"
        ? [{ name: "Host", value: `<@${schedule.hostId}>`, inline: true }]
        : []),
      profileField(schedule.hostUrl),
      ...(interactive && schedule.roleId
        ? [{ name: "Event Role", value: `<@&${schedule.roleId}>` }]
        : []),
      {
        name: `✅ Attending (${attending})`,
        value: mentions(attendance, "Attending"),
        inline: true,
      },
      {
        name: `☑️ Tentative (${tentative})`,
        value: mentions(attendance, "Tentative"),
        inline: true,
      },
    );
  if (schedule.worldLink) embed.setURL(schedule.worldLink);
  if (schedule.imageUrl) embed.setImage(schedule.imageUrl);
  const components = interactive
    ? [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(componentId("attend", schedule.id))
            .setLabel("Attend")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(componentId("tentative", schedule.id))
            .setLabel("Tentative")
            .setEmoji("☑️")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(componentId("delete", schedule.id))
            .setLabel("Delete")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger),
        ),
      ]
    : [];
  return { embeds: [embed], components };
}
