using DSharpPlus;
using DSharpPlus.Entities;
using DSharpPlus.EventArgs;
using DSharpPlus.Interactivity;
using DSharpPlus.Interactivity.Enums;
using DSharpPlus.Interactivity.Extensions;
using DSharpPlus.VoiceNext;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.VisualBasic;
using Mysqlx.Crud;
using SchedulingAssistant.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace SchedulingAssistant.Services
{
    internal class InteractivityHandler
    {
        private readonly DiscordClient _client;
        private readonly IServiceProvider _services;
        private readonly ILogger<InteractivityHandler> _logger;

        public InteractivityHandler(IServiceProvider services)
        {
            _services = services;
            _client = _services.GetRequiredService<DiscordClient>();
            _logger = _services.GetRequiredService<ILogger<InteractivityHandler>>();
            _client.UseInteractivity(new InteractivityConfiguration()
            {
                PollBehaviour = PollBehaviour.KeepEmojis,
                Timeout = TimeSpan.FromSeconds(30)
            });
        }

        public Task Initalize()
        {
            _logger.LogInformation("Initializing Interactivity Handler!");
            //_client.InteractionCreated += OnInteractionCreated;
            _client.ComponentInteractionCreated += OnComponentInteractionCreated;
            _client.ModalSubmitted += OnModalSubmitted;
            _client.ContextMenuInteractionCreated += OnContextMenuInteractionCreated;
            _logger.LogInformation("Interactivity Handler Has Started!");
            return Task.CompletedTask;
        }

        private Task OnContextMenuInteractionCreated(DiscordClient sender, ContextMenuInteractionCreateEventArgs e)
        {
            throw new NotImplementedException();
        }

        private async Task OnModalSubmitted(DiscordClient sender, ModalSubmitEventArgs e)
        {
            _logger.LogInformation($"{e.Interaction.GuildId} \"{e.Interaction.User.Username}\" responded to a modal.");
            await Task.Run(() => ModalHandler(e));
        }

        private async Task OnComponentInteractionCreated(DiscordClient sender, ComponentInteractionCreateEventArgs e)
        {
            _logger.LogInformation($"{e.Interaction.GuildId} \"{e.Interaction.User.Username}\" made an interaction. Id is: \"{e.Id}\" ");
            await Task.Run(() => InteractionHandler(e));

        }




        private async Task ModalHandler(ModalSubmitEventArgs e)
        {
            string CommandRegex = @"([a-zA-Z]*)_{1}(\d*)";
            Match CommandMatch = Regex.Match(e.Interaction.Data.CustomId, CommandRegex);
            if (CommandMatch.Success)
            {
                using (var db = new DBEntities())
                {
                    string Message = "";
                    var dbSchedule = db.Schedules.Include(x => x.Attendees).FirstOrDefault(x => x.Id == int.Parse(CommandMatch.Groups[2].Value));
                    if (dbSchedule == null)
                    {
                        await e.Interaction.CreateResponseAsync(InteractionResponseType.DeferredMessageUpdate);
                        _logger.LogWarning($"User {e.Interaction.User.Username} attempted to interact with a schedule that does not exist.");

                        return;
                    }
                    switch (CommandMatch.Groups[1].Value)
                    {
                        case "DeleteConfirmation":

                            if (!string.IsNullOrEmpty(e.Values["text"]))
                            {
                                if (e.Values["text"].ToLower().Trim() == dbSchedule.Id.ToString().ToLower().Trim())
                                {
                                    _logger.LogInformation($"User {e.Interaction.User.Username} is has removed an event of Id: {dbSchedule.Id}");
                                    dbSchedule.IsActive = false;
                                    dbSchedule.HasEnded = true;
                                    await dbSchedule.Update();
                                    var Channel = await _client.GetChannelAsync(e.Interaction.Channel.Id);
                                    if (dbSchedule.RoleId != null)
                                    {
                                        ulong RoleId = (ulong)dbSchedule.RoleId;
                                        try
                                        {
                                            DiscordRole? role = e.Interaction.Guild.GetRole(RoleId);
                                            if (role != null)
                                            {
                                                await role.DeleteAsync();
                                            }
                                        }
                                        catch
                                        {

                                        }
                                    }
                                    await e.Interaction.CreateResponseAsync(InteractionResponseType.UpdateMessage,
                                        new DiscordInteractionResponseBuilder(dbSchedule.BuildMessage(withInteractions: false)));
                                }
                                else
                                {
                                    await e.Interaction.CreateResponseAsync(InteractionResponseType.DeferredMessageUpdate);
                                }

                            }
                            else
                            {
                                await e.Interaction.CreateResponseAsync(InteractionResponseType.DeferredMessageUpdate);
                            }
                            break;
                        default:
                            await e.Interaction.CreateResponseAsync(InteractionResponseType.DeferredMessageUpdate);
                            break;

                    }
                }
            }
        }

        private async Task InteractionHandler(ComponentInteractionCreateEventArgs e)
        {
            //Group 0: Command Name
            //Group 1: Id of Command
            string CommandRegex = @"([a-zA-Z]*)_{1}(\d*)";
            Match CommandMatch = Regex.Match(e.Id, CommandRegex);
            if (CommandMatch.Success)
            {
                using (var db = new DBEntities())
                {
                    string Message = "";
                    var dbSchedule = db.Schedules.Include(x => x.Attendees).FirstOrDefault(x => x.Id == int.Parse(CommandMatch.Groups[2].Value));
                    if (dbSchedule == null)
                    {
                        await e.Interaction.CreateResponseAsync(InteractionResponseType.DeferredMessageUpdate);
                        _logger.LogWarning($"User {e.Interaction.User.Username} attempted to interact with a schedule that does not exist.");

                        return;
                    }
                    switch (CommandMatch.Groups[1].Value)
                    {
                        case "Delete":
                            DiscordMember DiscordMember = (DiscordMember)e.User;
                            if (!DiscordMember.Roles.Any(x => x.CheckPermission(Permissions.ManageMessages | Permissions.Administrator) == PermissionLevel.Allowed))
                            {
                                _logger.LogInformation($"User {e.Interaction.User.Username} is does not have permission to remove an event");
                                await e.Interaction.CreateResponseAsync(InteractionResponseType.DeferredMessageUpdate);
                                return;
                            }
                            try
                            {
                                var Builder = new DiscordInteractionResponseBuilder().WithTitle("Delete Confirmation").WithCustomId($"DeleteConfirmation_{dbSchedule.Id}").WithContent($"{e.User.Mention}, Do you really want to delete this event?");

                                Builder.IsEphemeral = true;

                                Builder.AddComponents(new TextInputComponent($"Type in \'{dbSchedule.Id}\' to delete event:", "text", placeholder: "", required: true, style: TextInputStyle.Paragraph));

                                await e.Interaction.CreateResponseAsync(InteractionResponseType.Modal, Builder);
                            }
                            catch (Exception ex)
                            {
                                _logger.LogError($"Failed to produced a modal: {ex}");
                                await e.Interaction.CreateResponseAsync(InteractionResponseType.DeferredMessageUpdate);
                            }


                            break;

                        case "Tentative":
                            Message = await dbSchedule.UpdateAttendee(e.User.Id, e.User.Username, "Tentative");
                            _logger.LogInformation($"User {e.Interaction.User.Username} is {Message.ToLower()}");
                            DiscordMember DMT = (DiscordMember)e.User;
                            ulong TRoleId = (ulong)dbSchedule.RoleId;
                            try
                            {
                                DiscordRole? role = e.Guild.GetRole(TRoleId);
                                if (role != null)
                                {
                                    if (Message.ToLower().Contains("not"))
                                    {
                                        await DMT.RevokeRoleAsync(role);
                                    }
                                    else
                                    {
                                        await DMT.GrantRoleAsync(role);
                                    }
                                }
                            }
                            catch
                            {

                            }
                            await e.Interaction.CreateResponseAsync(InteractionResponseType.UpdateMessage,
                                new DiscordInteractionResponseBuilder(dbSchedule.BuildMessage(withInteractions: true)));
                            break;
                        case "Accept":
                            Message = await dbSchedule.UpdateAttendee(e.User.Id, e.User.Username, "Attending");
                            _logger.LogInformation($"User {e.Interaction.User.Username} is {Message.ToLower()}");
                            DiscordMember DMA = (DiscordMember)e.User;
                            ulong ARoleId = (ulong)dbSchedule.RoleId;
                            try
                            {
                                DiscordRole? role = e.Guild.GetRole(ARoleId);
                                if (role != null)
                                {
                                    if (Message.ToLower().Contains("not"))
                                    {
                                        await DMA.RevokeRoleAsync(role);
                                    }
                                    else
                                    {
                                        await DMA.GrantRoleAsync(role);
                                    }
                                }
                            }
                            catch
                            {

                            }
                            await e.Interaction.CreateResponseAsync(InteractionResponseType.UpdateMessage,
                                new DiscordInteractionResponseBuilder(dbSchedule.BuildMessage(withInteractions: true)));
                            break;
                        case "Edit":
                            _logger.LogInformation($"User {e.Interaction.User.Username} has rquested to edit an event");
                            await e.Interaction.CreateResponseAsync(InteractionResponseType.DeferredMessageUpdate);
                            break;
                        default:
                            await e.Interaction.CreateResponseAsync(InteractionResponseType.DeferredMessageUpdate);
                            break;
                    }
                }
            }
            else
            {
                _logger.LogWarning($"Unable to process interaction. Send this to Duinrahaic. {e.Id}");
                await e.Interaction.CreateResponseAsync(InteractionResponseType.DeferredMessageUpdate);
            }
        }
    }
}
