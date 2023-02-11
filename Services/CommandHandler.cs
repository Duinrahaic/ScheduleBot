using DSharpPlus;
using DSharpPlus.EventArgs;
using DSharpPlus.SlashCommands;
using DSharpPlus.SlashCommands.EventArgs;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System.Reflection;

namespace SchedulingAssistant.Services
{
    internal class CommandHandler
    {
        private readonly IServiceProvider _services;
        private readonly DiscordClient _client;
        private readonly ILogger<CommandHandler> _logger;
        private readonly SlashCommandsExtension _commands;
        private readonly DatabaseHandler _db;
        public CommandHandler(IServiceProvider services)
        {
            _services = services;
            _logger = _services.GetRequiredService<ILogger<CommandHandler>>();
            _client = _services.GetRequiredService<DiscordClient>();
            _db = _services.GetRequiredService<DatabaseHandler>();
            _commands = _client.UseSlashCommands(new SlashCommandsConfiguration()
            {
                Services = _services
            });
        }

        public Task Initalize()
        {
            _logger.LogInformation("Initializing Command Handler!");
            //_client.Ready += OnReady;
            //_client.GuildAvailable += OnGuildAvailable;
            try
            {
                _commands.RegisterCommands(Assembly.GetExecutingAssembly());

            }
            catch (Exception ex)
            {
                _logger.LogError($"Error Registering Commands: {ex}");
            }
            _client.Ready += OnReady;
            _commands.SlashCommandExecuted += OnSlashCommandExecuted;
            _commands.SlashCommandErrored += OnSlashCommandErrored;
            _commands.SlashCommandInvoked += OnSlashCommandInvoked;
            _logger.LogInformation("Command Handler Has Started!");
            return Task.CompletedTask;
        }

        private Task OnReady(DiscordClient sender, ReadyEventArgs e)
        {

            var RSC = sender.GetSlashCommands();
            foreach (var x in RSC.RegisteredCommands)
            {
                foreach (var sc in x.Value)
                {
                    _logger.LogDebug($"Slash Command: '{sc.Name}' is available");
                }
            }
            return Task.CompletedTask;
        }

        public async Task FlushCommands()
        {
            var commands = await _client.GetGlobalApplicationCommandsAsync();
        }


        //private async Task OnReady(DiscordClient sender, ReadyEventArgs e)
        //{
        //    var commands = await _client.GetGlobalApplicationCommandsAsync();
        //    foreach (var c in commands)
        //    {
        //        await _client.DeleteGlobalApplicationCommandAsync(c.Id);
        //    }
        //}

        //private async Task OnGuildAvailable(DiscordClient sender, GuildCreateEventArgs e)
        //{
        //    _logger.LogInformation("Command Handler Is Registering Commands!");
        //    var commands = await _client.GetGuildApplicationCommandsAsync(e.Guild.Id);
        //    try
        //    {
        //        foreach (var c in commands)
        //        {
        //            await _client.DeleteGuildApplicationCommandAsync(e.Guild.Id, c.Id);
        //        }
        //    }
        //    catch (Exception ex)
        //    {
        //        _logger.LogError($"Error Registering Commands: {ex}");
        //    }
        //}




        private Task OnSlashCommandInvoked(SlashCommandsExtension sender, SlashCommandInvokedEventArgs e)
        {
            _logger.LogInformation($"{e.Context.Member.Guild.Name} \"{e.Context.Member.DisplayName}\" Invoked -> {e.Context.CommandName}");
            return Task.CompletedTask;
        }

        private Task OnSlashCommandErrored(SlashCommandsExtension sender, SlashCommandErrorEventArgs e)
        {
            _logger.LogError($"{e.Context.Member.Guild.Name} \"{e.Context.Member.DisplayName}\" Errored -> {e.Context.CommandName} : {e.Exception}");
            return Task.CompletedTask;
        }

        private Task OnSlashCommandExecuted(SlashCommandsExtension sender, SlashCommandExecutedEventArgs e)
        {
            _logger.LogInformation($"{e.Context.Member.Guild.Name} \"{e.Context.Member.DisplayName}\" Executed -> {e.Context.CommandName}");
            return Task.CompletedTask;
        }
    }
}
