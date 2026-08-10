import {
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";
import { DateTime } from "luxon";
import type { Config } from "../config.js";
import type { NewSchedule, Schedule } from "../domain.js";
import type { Logger } from "../logger.js";
import { Repository } from "../repository.js";
import { isHttpUrl, parseDurationHours, parseEventDate } from "../time.js";
import { eventMessage } from "./messages.js";

const adminPermissions = PermissionFlagsBits.ManageMessages;
const command = (name: string, description: string): SlashCommandBuilder =>
  new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setDMPermission(false)
    .setDefaultMemberPermissions(adminPermissions);

export const commandDefinitions = [
  command(
    "seteventchannel",
    "Set the channel where events are posted",
  ).addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Event channel")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true),
  ),
  command("event", "Create an event")
    .addStringOption((o) =>
      o
        .setName("name")
        .setDescription("Event name")
        .setMaxLength(256)
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("description")
        .setDescription("Event details")
        .setMaxLength(2000)
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("start")
        .setDescription("ISO date/time or Discord timestamp")
        .setRequired(true),
    )
    .addNumberOption((o) =>
      o
        .setName("duration")
        .setDescription("Duration in hours")
        .setMinValue(0.01)
        .setMaxValue(336)
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("profile_url")
        .setDescription("Host profile URL")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("timezone")
        .setDescription("IANA time zone, such as America/New_York"),
    )
    .addUserOption((o) => o.setName("host").setDescription("Event host"))
    .addStringOption((o) =>
      o.setName("world_url").setDescription("Optional world URL"),
    )
    .addStringOption((o) =>
      o.setName("image_url").setDescription("Optional image URL"),
    ),
  command("edit", "Edit an event")
    .addStringOption((o) =>
      o
        .setName("message_id")
        .setDescription("Discord event message ID")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("name").setDescription("New event name").setMaxLength(256),
    )
    .addStringOption((o) =>
      o
        .setName("description")
        .setDescription("New event description")
        .setMaxLength(2000),
    )
    .addStringOption((o) =>
      o
        .setName("start")
        .setDescription("New ISO date/time or Discord timestamp"),
    )
    .addNumberOption((o) =>
      o
        .setName("duration")
        .setDescription("New duration in hours")
        .setMinValue(0.01)
        .setMaxValue(336),
    )
    .addStringOption((o) =>
      o.setName("timezone").setDescription("IANA time zone"),
    )
    .addUserOption((o) => o.setName("host").setDescription("New event host"))
    .addStringOption((o) =>
      o.setName("profile_url").setDescription("New host profile URL"),
    )
    .addStringOption((o) =>
      o.setName("world_url").setDescription("New world URL, or 'clear'"),
    )
    .addStringOption((o) =>
      o.setName("image_url").setDescription("New image URL, or 'clear'"),
    ),
  command("restartevent", "Restart an ended event").addStringOption((o) =>
    o
      .setName("message_id")
      .setDescription("Discord event message ID")
      .setRequired(true),
  ),
  command("refresh", "Refresh active event messages"),
  command("getattendancereport", "DM a CSV attendance report")
    .addStringOption((o) =>
      o
        .setName("start")
        .setDescription("Start date/time in ISO format")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("end")
        .setDescription("End date/time in ISO format")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("timezone").setDescription("IANA time zone").setRequired(true),
    ),
  command("version", "Show the ScheduleBot version"),
].map((definition) => definition.toJSON());

function requireGuild(interaction: ChatInputCommandInteraction): Guild {
  if (!interaction.guild)
    throw new Error("This command can only be used in a server");
  return interaction.guild;
}

function messageId(value: string): string {
  if (!/^\d{17,20}$/.test(value.trim()))
    throw new Error(
      "Message ID must contain exactly one valid Discord snowflake",
    );
  return value.trim();
}

async function eventChannel(
  repository: Repository,
  guild: Guild,
): Promise<GuildTextBasedChannel> {
  const setting = await repository.getSetting(guild.id);
  if (!setting?.channelId)
    throw new Error("No event channel is set. Use /seteventchannel first.");
  const channel = await guild.channels.fetch(setting.channelId);
  if (!channel?.isTextBased() || !channel.isSendable() || channel.isDMBased())
    throw new Error(
      "The configured event channel is unavailable or not writable",
    );
  return channel;
}

async function uniqueRole(guild: Guild, prefix: string) {
  await guild.roles.fetch();
  for (let suffix = 1; suffix <= 9999; suffix += 1) {
    const name = `${prefix}-${suffix}`;
    if (!guild.roles.cache.some((role) => role.name === name))
      return guild.roles.create({
        name,
        reason: "ScheduleBot event attendance",
      });
  }
  throw new Error("Unable to allocate a unique event role name");
}

function checkedUrl(value: string | null, label: string): string | null {
  if (value === null || value.toLowerCase() === "clear") return null;
  if (!isHttpUrl(value))
    throw new Error(`${label} must be an http:// or https:// URL`);
  return value;
}

export class CommandHandler {
  public constructor(
    private readonly repository: Repository,
    private readonly config: Config,
    private readonly logger: Logger,
  ) {}

  public async handle(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = requireGuild(interaction);
    await interaction.deferReply({ ephemeral: true });
    switch (interaction.commandName) {
      case "seteventchannel": {
        const channel = interaction.options.getChannel("channel", true);
        await this.repository.setEventChannel(guild.id, channel.id);
        await interaction.editReply(
          `Events will be posted in <#${channel.id}>.`,
        );
        return;
      }
      case "event":
        return this.create(interaction, guild);
      case "edit":
        return this.edit(interaction, guild);
      case "restartevent":
        return this.restart(interaction, guild);
      case "refresh":
        return this.refresh(interaction, guild);
      case "getattendancereport":
        return this.report(interaction, guild);
      case "version":
        await interaction.editReply(
          `ScheduleBot v${process.env.npm_package_version ?? "2.0.0"}`,
        );
        return;
      default:
        throw new Error("Unknown command");
    }
  }

  private async create(
    interaction: ChatInputCommandInteraction,
    guild: Guild,
  ): Promise<void> {
    const channel = await eventChannel(this.repository, guild);
    const zone = interaction.options.getString("timezone") ?? "UTC";
    if (!DateTime.local().setZone(zone).isValid)
      throw new Error("Timezone must be a valid IANA time zone");
    const startTime = parseEventDate(
      interaction.options.getString("start", true),
      zone,
    );
    const endTime = new Date(
      startTime.getTime() +
        parseDurationHours(interaction.options.getNumber("duration", true)),
    );
    const profile = checkedUrl(
      interaction.options.getString("profile_url", true),
      "Profile URL",
    );
    if (!profile) throw new Error("Profile URL is required");
    const world = checkedUrl(
      interaction.options.getString("world_url"),
      "World URL",
    );
    const image = checkedUrl(
      interaction.options.getString("image_url"),
      "Image URL",
    );
    const host = interaction.options.getUser("host") ?? interaction.user;
    const role = await uniqueRole(guild, this.config.rolePrefix);
    let schedule: Schedule | null = null;
    let sentMessage: Message | null = null;
    try {
      const input: NewSchedule = {
        startTime,
        endTime,
        timeZone: zone,
        serverId: guild.id,
        eventTitle: interaction.options.getString("name", true),
        eventDescription: interaction.options.getString("description", true),
        worldLink: world,
        hostId: host.bot ? "0" : host.id,
        roleId: role.id,
        hostName: host.bot ? "clear" : host.username,
        hostUrl: profile,
        imageUrl: image,
      };
      schedule = await this.repository.createSchedule(input);
      sentMessage = await channel.send(eventMessage(schedule, []));
      await this.repository.updateSchedule(schedule.id, {
        eventId: sentMessage.id,
      });
      await interaction.editReply(`Created event ${sentMessage.url}.`);
    } catch (error) {
      if (sentMessage)
        await sentMessage
          .delete()
          .catch((cleanupError: unknown) =>
            this.logger.error(
              "Failed to roll back event message",
              cleanupError,
            ),
          );
      if (schedule)
        await this.repository
          .deleteSchedule(schedule.id)
          .catch((cleanupError: unknown) =>
            this.logger.error("Failed to roll back event", cleanupError),
          );
      await role
        .delete("Event creation failed")
        .catch((cleanupError: unknown) =>
          this.logger.error("Failed to roll back role", cleanupError),
        );
      throw error;
    }
  }

  private async edit(
    interaction: ChatInputCommandInteraction,
    guild: Guild,
  ): Promise<void> {
    const schedule = await this.repository.getScheduleByMessage(
      guild.id,
      messageId(interaction.options.getString("message_id", true)),
    );
    if (!schedule)
      throw new Error("No event with that message ID exists in this server");
    const values: Partial<Omit<Schedule, "id">> = {};
    const zone = interaction.options.getString("timezone") ?? schedule.timeZone;
    if (!DateTime.local().setZone(zone).isValid)
      throw new Error("Timezone must be a valid IANA time zone");
    if (interaction.options.getString("timezone")) values.timeZone = zone;
    const start = interaction.options.getString("start");
    if (start) values.startTime = parseEventDate(start, zone);
    const duration = interaction.options.getNumber("duration");
    if (duration !== null)
      values.endTime = new Date(
        (values.startTime ?? schedule.startTime).getTime() +
          parseDurationHours(duration),
      );
    else if (values.startTime)
      values.endTime = new Date(
        values.startTime.getTime() +
          schedule.endTime.getTime() -
          schedule.startTime.getTime(),
      );
    const strings = [
      ["name", "eventTitle"],
      ["description", "eventDescription"],
    ] as const;
    for (const [option, field] of strings) {
      const value = interaction.options.getString(option);
      if (value !== null) values[field] = value;
    }
    const host = interaction.options.getUser("host");
    if (host) {
      values.hostId = host.bot ? "0" : host.id;
      values.hostName = host.bot ? "clear" : host.username;
    }
    const profile = interaction.options.getString("profile_url");
    if (profile !== null) {
      const value = checkedUrl(profile, "Profile URL");
      if (!value) throw new Error("Profile URL cannot be cleared");
      values.hostUrl = value;
    }
    const world = interaction.options.getString("world_url");
    if (world !== null) values.worldLink = checkedUrl(world, "World URL");
    const image = interaction.options.getString("image_url");
    if (image !== null) values.imageUrl = checkedUrl(image, "Image URL");
    await this.repository.updateSchedule(schedule.id, values);
    const updated = await this.repository.getScheduleById(schedule.id);
    if (!updated) throw new Error("Event disappeared while editing");
    const channel = await eventChannel(this.repository, guild);
    const message = await channel.messages.fetch(updated.eventId);
    await message.edit(
      eventMessage(
        updated,
        await this.repository.listAttendance(updated.id),
        !updated.hasEnded,
      ),
    );
    await interaction.editReply(`Updated event ${message.url}.`);
  }

  private async restart(
    interaction: ChatInputCommandInteraction,
    guild: Guild,
  ): Promise<void> {
    const schedule = await this.repository.getScheduleByMessage(
      guild.id,
      messageId(interaction.options.getString("message_id", true)),
    );
    if (!schedule)
      throw new Error("No event with that message ID exists in this server");
    if (!schedule.hasEnded)
      throw new Error("Only an ended event can be restarted");
    let role = schedule.roleId
      ? guild.roles.cache.get(schedule.roleId)
      : undefined;
    if (!role) role = await uniqueRole(guild, this.config.rolePrefix);
    await this.repository.updateSchedule(schedule.id, {
      roleId: role.id,
      threadId: null,
      isActive: false,
      hasEnded: false,
    });
    for (const attendee of await this.repository.listAttendance(schedule.id)) {
      const member = await guild.members
        .fetch(attendee.userId)
        .catch(() => null);
      if (member)
        await member.roles
          .add(role)
          .catch((error: unknown) =>
            this.logger.warn("Could not restore attendee role", error),
          );
    }
    const updated = await this.repository.getScheduleById(schedule.id);
    if (!updated) throw new Error("Event disappeared while restarting");
    const message = await (
      await eventChannel(this.repository, guild)
    ).messages.fetch(updated.eventId);
    await message.edit(
      eventMessage(updated, await this.repository.listAttendance(updated.id)),
    );
    await interaction.editReply(`Restarted event ${message.url}.`);
  }

  private async refresh(
    interaction: ChatInputCommandInteraction,
    guild: Guild,
  ): Promise<void> {
    const channel = await eventChannel(this.repository, guild);
    let refreshed = 0;
    for (const schedule of (
      await this.repository.listSchedules(guild.id)
    ).filter((item) => !item.hasEnded)) {
      try {
        const message = await channel.messages.fetch(schedule.eventId);
        await message.edit(
          eventMessage(
            schedule,
            await this.repository.listAttendance(schedule.id),
          ),
        );
        refreshed += 1;
      } catch (error) {
        this.logger.warn(`Could not refresh event ${schedule.id}`, error);
      }
    }
    await interaction.editReply(`Refreshed ${refreshed} event message(s).`);
  }

  private async report(
    interaction: ChatInputCommandInteraction,
    guild: Guild,
  ): Promise<void> {
    const zone = interaction.options.getString("timezone", true);
    if (!DateTime.local().setZone(zone).isValid)
      throw new Error("Timezone must be a valid IANA time zone");
    const start = parseEventDate(
      interaction.options.getString("start", true),
      zone,
    );
    const end = parseEventDate(
      interaction.options.getString("end", true),
      zone,
    );
    if (end <= start) throw new Error("Report end must be after report start");
    const events = await this.repository.attendanceReport(guild.id, start, end);
    const escape = (value: string | number | null): string =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = ["EventId,Date,Name,Description,UserId,UserName,Status"];
    for (const event of events)
      for (const attendee of event.attendance)
        rows.push(
          [
            event.eventId,
            DateTime.fromJSDate(event.startTime).setZone(zone).toISO(),
            event.eventTitle,
            event.eventDescription,
            attendee.userId,
            attendee.name,
            attendee.status,
          ]
            .map(escape)
            .join(","),
        );
    await interaction.user.send({
      content:
        rows.length === 1
          ? "There were no attendance records in that range."
          : "Here is your attendance report.",
      files:
        rows.length === 1
          ? []
          : [
              new AttachmentBuilder(Buffer.from(rows.join("\n")), {
                name: "attendance.csv",
              }),
            ],
    });
    await interaction.editReply("The attendance report was sent to your DMs.");
  }
}
