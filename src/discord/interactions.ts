import {
  ActionRowBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { deletionModalId, parseInteractionId } from "../interactions.js";
import type { Logger } from "../logger.js";
import { Repository } from "../repository.js";
import { eventMessage } from "./messages.js";

const canDelete = (
  permissions: Readonly<{ has(permission: bigint): boolean }> | null,
): boolean =>
  Boolean(
    permissions?.has(PermissionFlagsBits.ManageMessages) ||
    permissions?.has(PermissionFlagsBits.Administrator),
  );

export class InteractionHandler {
  public constructor(
    private readonly repository: Repository,
    private readonly logger: Logger,
  ) {}

  public async button(interaction: ButtonInteraction): Promise<void> {
    const parsed = parseInteractionId(interaction.customId);
    if (!parsed || parsed.kind !== "component") {
      await interaction.reply({
        content: "This button is invalid or from an unsupported bot version.",
        ephemeral: true,
      });
      return;
    }
    const schedule = await this.repository.getScheduleById(parsed.scheduleId);
    if (
      !schedule ||
      !interaction.guild ||
      schedule.serverId !== interaction.guild.id ||
      schedule.eventId !== interaction.message.id
    ) {
      await interaction.reply({
        content:
          "This event no longer exists or does not belong to this message.",
        ephemeral: true,
      });
      return;
    }
    if (schedule.hasEnded) {
      await interaction.reply({
        content: "This event has ended.",
        ephemeral: true,
      });
      return;
    }
    if (parsed.action === "delete") {
      if (!canDelete(interaction.memberPermissions)) {
        await interaction.reply({
          content: "Manage Messages permission is required to delete an event.",
          ephemeral: true,
        });
        return;
      }
      const input = new TextInputBuilder()
        .setCustomId("confirmation")
        .setLabel(`Type ${schedule.id} to delete this event`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const modal = new ModalBuilder()
        .setCustomId(deletionModalId(schedule.id))
        .setTitle("Delete event confirmation")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(input),
        );
      await interaction.showModal(modal);
      return;
    }

    await interaction.deferUpdate();
    const guild = interaction.guild;
    const desired = parsed.action === "attend" ? "Attending" : "Tentative";
    await this.repository.updateAttendance(
      schedule.id,
      interaction.user.id,
      interaction.user.username,
      desired,
      async ({ result, attendance }) => {
        if (schedule.roleId) {
          try {
            const role =
              guild.roles.cache.get(schedule.roleId) ??
              (await guild.roles.fetch(schedule.roleId));
            const member = await guild.members.fetch(interaction.user.id);
            if (role) {
              if (result.status) await member.roles.add(role);
              else await member.roles.remove(role);
            }
          } catch (error) {
            this.logger.warn("Could not update attendance role", error);
          }
        }
        await interaction.editReply(eventMessage(schedule, attendance));
      },
    );
  }

  public async modal(interaction: ModalSubmitInteraction): Promise<void> {
    const parsed = parseInteractionId(interaction.customId);
    if (!parsed || parsed.kind !== "delete-confirm") {
      await interaction.reply({
        content: "This confirmation form is invalid.",
        ephemeral: true,
      });
      return;
    }
    // Authorization is deliberately checked again at submission time.
    if (!canDelete(interaction.memberPermissions)) {
      await interaction.reply({
        content: "Manage Messages permission is required to delete an event.",
        ephemeral: true,
      });
      return;
    }
    const schedule = await this.repository.getScheduleById(parsed.scheduleId);
    if (
      !schedule ||
      !interaction.guild ||
      schedule.serverId !== interaction.guild.id ||
      interaction.message?.id !== schedule.eventId
    ) {
      await interaction.reply({
        content:
          "This event no longer exists or does not belong to this message.",
        ephemeral: true,
      });
      return;
    }
    const confirmation = interaction.fields
      .getTextInputValue("confirmation")
      .trim();
    if (confirmation !== String(schedule.id)) {
      await interaction.reply({
        content: "Confirmation did not match; the event was not deleted.",
        ephemeral: true,
      });
      return;
    }
    await interaction.deferUpdate();
    await this.repository.updateSchedule(schedule.id, {
      hasEnded: true,
      isActive: false,
    });
    if (schedule.roleId) {
      const role = await interaction.guild.roles
        .fetch(schedule.roleId)
        .catch(() => null);
      if (role)
        await role
          .delete("ScheduleBot event deleted")
          .catch((error: unknown) =>
            this.logger.warn("Could not delete event role", error),
          );
    }
    if (schedule.threadId) {
      const thread = await interaction.guild.channels
        .fetch(schedule.threadId)
        .catch(() => null);
      if (thread?.isThread())
        await thread
          .delete("ScheduleBot event deleted")
          .catch((error: unknown) =>
            this.logger.warn("Could not delete event thread", error),
          );
    }
    const ended = { ...schedule, hasEnded: true, isActive: false };
    await interaction.editReply(
      eventMessage(
        ended,
        await this.repository.listAttendance(schedule.id),
        false,
      ),
    );
  }
}
