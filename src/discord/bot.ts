import {
  ThreadAutoArchiveDuration,
  Client,
  Events,
  GatewayIntentBits,
  type Interaction,
} from "discord.js";
import type { Config } from "../config.js";
import type { Schedule } from "../domain.js";
import type { Logger } from "../logger.js";
import { Repository } from "../repository.js";
import {
  NonOverlappingScheduler,
  SchedulerTransitionApplier,
  selectTransitions,
  type SchedulerTransitionEffects,
} from "../scheduler.js";
import { discordTimestamp } from "../time.js";
import { CommandHandler, commandDefinitions } from "./commands.js";
import { InteractionHandler } from "./interactions.js";
import { eventMessage } from "./messages.js";

export function isMissingDiscordResourceError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error))
    return false;
  const code = (error as { code?: unknown }).code;
  return code === 10003 || code === 10004 || code === 10011;
}

export async function ignoreMissingDiscordResource(
  work: () => Promise<void>,
): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (!isMissingDiscordResourceError(error)) throw error;
  }
}

export async function replyWithInteractionError(
  interaction: Interaction,
  error: unknown,
): Promise<void> {
  if (!interaction.isRepliable()) return;
  const message = error instanceof Error ? error.message : "Unexpected error";
  const content = `Error: ${message}`;
  if (interaction.deferred && interaction.isChatInputCommand()) {
    await interaction
      .editReply({ content, components: [] })
      .catch(() => undefined);
  } else if (interaction.deferred || interaction.replied) {
    // deferUpdate acknowledges the public event message. Never replace that
    // message with an operational error from a button or modal interaction.
    await interaction
      .followUp({ content, ephemeral: true })
      .catch(() => undefined);
  } else {
    await interaction
      .reply({ content, ephemeral: true })
      .catch(() => undefined);
  }
}

export class ScheduleBot {
  private readonly client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });
  private readonly commands: CommandHandler;
  private readonly interactions: InteractionHandler;
  private readonly scheduler: NonOverlappingScheduler;
  private readonly transitionApplier: SchedulerTransitionApplier;
  private ready = false;

  public constructor(
    private readonly repository: Repository,
    private readonly config: Config,
    private readonly logger: Logger,
  ) {
    this.commands = new CommandHandler(repository, config, logger);
    this.interactions = new InteractionHandler(repository, logger);
    const effects: SchedulerTransitionEffects = {
      ensureThread: (schedule) => this.ensureEventThread(schedule),
      announceStart: (schedule, threadId) =>
        this.announceEventStart(schedule, threadId),
      renderEndedEvent: (schedule) => this.renderEndedEvent(schedule),
      announceEnd: (schedule) => this.announceEventEnd(schedule),
      deleteRole: (schedule) => this.deleteEventRole(schedule),
      archiveThread: (schedule) => this.archiveEventThread(schedule),
    };
    this.transitionApplier = new SchedulerTransitionApplier(
      repository,
      effects,
      logger,
    );
    this.scheduler = new NonOverlappingScheduler(
      config.schedulerIntervalMs,
      () => this.schedulerTick(),
      logger,
    );
    this.client.on(
      Events.InteractionCreate,
      (interaction) => void this.handleInteraction(interaction),
    );
    this.client.once(Events.ClientReady, (client) => {
      void this.onReady(client.user.tag).catch((error: unknown) =>
        this.logger.error("Discord ready initialization failed", error),
      );
    });
    this.client.on(Events.Error, (error) =>
      this.logger.error("Discord client error", error),
    );
    this.client.on(Events.Warn, (message) =>
      this.logger.warn("Discord warning", message),
    );
  }

  public isReady(): boolean {
    return this.ready;
  }

  public async start(): Promise<void> {
    await this.client.login(this.config.discordToken);
  }

  public async stop(): Promise<void> {
    this.ready = false;
    this.scheduler.stop();
    await this.client.destroy();
  }

  private async onReady(tag: string): Promise<void> {
    if (!this.client.application)
      throw new Error("Discord application is unavailable after login");
    await this.client.application.commands.set(commandDefinitions);
    this.ready = true;
    this.scheduler.start();
    this.logger.info(
      `Logged in as ${tag}; registered ${commandDefinitions.length} global commands`,
    );
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    try {
      if (interaction.isChatInputCommand())
        await this.commands.handle(interaction);
      else if (interaction.isButton())
        await this.interactions.button(interaction);
      else if (interaction.isModalSubmit())
        await this.interactions.modal(interaction);
    } catch (error) {
      this.logger.error("Interaction failed", error);
      await replyWithInteractionError(interaction, error);
    }
  }

  private async schedulerTick(): Promise<void> {
    const schedules = await this.repository.listSchedules();
    const transitions = selectTransitions(
      schedules,
      new Date(),
      this.config.schedulerLeadMinutes,
      this.config.cleanupDelayMinutes,
    );
    for (const transition of transitions) {
      try {
        await this.transitionApplier.apply(transition);
      } catch (error) {
        this.logger.error(
          `Scheduler ${transition.action} failed for event ${transition.schedule.id}`,
          error,
        );
      }
    }
  }

  private async eventMessage(schedule: Schedule) {
    const setting = await this.repository.getSetting(schedule.serverId);
    if (!setting?.channelId)
      throw new Error("Server has no configured event channel");
    const channel = await this.client.channels.fetch(setting.channelId);
    if (!channel?.isTextBased() || channel.isDMBased())
      throw new Error("Configured event channel is not text based");
    return channel.messages.fetch(schedule.eventId);
  }

  private async ensureEventThread(schedule: Schedule): Promise<string> {
    const message = await this.eventMessage(schedule);
    if (message.hasThread) {
      const existing =
        message.thread ?? (await this.client.channels.fetch(message.id));
      if (existing?.isThread()) return existing.id;
      throw new Error("The event message thread is unavailable");
    }
    const thread = await message.startThread({
      name: schedule.eventTitle.slice(0, 100),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
      reason: "ScheduleBot event starting soon",
    });
    return thread.id;
  }

  private async announceEventStart(
    schedule: Schedule,
    threadId: string,
  ): Promise<void> {
    const thread = await this.client.channels.fetch(threadId);
    if (!thread?.isThread()) throw new Error("Event thread is unavailable");
    const audience = schedule.roleId ? `<@&${schedule.roleId}>` : "everyone";
    await thread.send(
      `Hey ${audience}! **${schedule.eventTitle}** starts ${discordTimestamp(schedule.startTime, "R")}.`,
    );
  }

  private async renderEndedEvent(schedule: Schedule): Promise<void> {
    const message = await this.eventMessage(schedule);
    await message.edit(
      eventMessage(
        schedule,
        await this.repository.listAttendance(schedule.id),
        false,
      ),
    );
  }

  private async announceEventEnd(schedule: Schedule): Promise<void> {
    if (!schedule.threadId) return;
    const thread = await this.client.channels.fetch(schedule.threadId);
    if (thread?.isThread())
      await thread.send("The event is now over. Thank you for attending!");
  }

  private async deleteEventRole(schedule: Schedule): Promise<void> {
    if (!schedule.roleId) return;
    await ignoreMissingDiscordResource(async () => {
      const guild = await this.client.guilds.fetch(schedule.serverId);
      const role = await guild.roles.fetch(schedule.roleId!);
      if (role) await role.delete("ScheduleBot event cleanup");
    });
  }

  private async archiveEventThread(schedule: Schedule): Promise<void> {
    if (!schedule.threadId) return;
    await ignoreMissingDiscordResource(async () => {
      const thread = await this.client.channels.fetch(schedule.threadId!);
      if (thread?.isThread() && !thread.archived)
        await thread.setArchived(true, "ScheduleBot event cleanup");
    });
  }
}
