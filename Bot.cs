using DSharpPlus;
using DSharpPlus.EventArgs;
using DSharpPlus.SlashCommands;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SchedulingAssistant.Services;
using Serilog;
using System;

namespace SchedulingAssistant
{
    public class Bot
    {
        private DiscordClient? _Client;
        private ILogger<Bot>? _Logger;

        private static ServiceProvider ConfigureServices(string Token, LogLevel LogLevel = LogLevel.Debug)
        {
            if (Token.Count() == 0)
            {
                throw new Exception("Missing Discord Bot Token. Verify Configuration");
            }
            var logFactory = new LoggerFactory().AddSerilog();

            var config = new DiscordConfiguration()
            {
                Token = Token,
                TokenType = TokenType.Bot,
                Intents = DiscordIntents.AllUnprivileged,
                MinimumLogLevel = LogLevel.Debug,
                AutoReconnect = true,
                LoggerFactory = logFactory
            };

            var services = new ServiceCollection()
                .AddSingleton(x => new DiscordClient(config))
                .AddSingleton<CommandHandler>()
                .AddSingleton<DatabaseHandler>()
                .AddSingleton<InteractivityHandler>()
                .AddSingleton<Scheduler>()
                .AddLogging(configure => configure.AddSerilog());


            switch (LogLevel)
            {
                case LogLevel.Information:
                    {
                        services.Configure<LoggerFilterOptions>(options => options.MinLevel = LogLevel.Information);
                        break;
                    }
                case LogLevel.Error:
                    {
                        services.Configure<LoggerFilterOptions>(options => options.MinLevel = LogLevel.Error);
                        break;
                    }
                case LogLevel.Debug:
                    {
                        services.Configure<LoggerFilterOptions>(options => options.MinLevel = LogLevel.Debug);
                        break;
                    }
                default:
                    {
                        services.Configure<LoggerFilterOptions>(options => options.MinLevel = LogLevel.Error);
                        break;
                    }
            }
            var serviceProvider = services.BuildServiceProvider();
            return serviceProvider;
        }


        // this method logs in and starts the client
        public async Task StartAsync(string Token)
        {
            await using var services = ConfigureServices(Token);
            _Client = services.GetRequiredService<DiscordClient>();
            _Logger = services.GetRequiredService<ILogger<Bot>>();

            if (_Client == null)
            {
                throw new Exception("DiscordClient has not been configured");
            }


            await services.GetRequiredService<DatabaseHandler>().Initalize();
            await services.GetRequiredService<CommandHandler>().Initalize();
            await services.GetRequiredService<InteractivityHandler>().Initalize();
            await services.GetRequiredService<Scheduler>().Initalize();

            _Client.Ready += OnReady;
            _Client.GuildAvailable += OnGuildAvailable;
            _Client.GuildUnavailable += OnGuildUnavailable; ;
            _Client.GuildDownloadCompleted += OnGuildDownloadComplete;
            _Client.Heartbeated += OnHeartbeat;
            _Client.Zombied += OnZombied;
            await _Client.ConnectAsync();

            await Task.Delay(Timeout.Infinite);
        }

        private Task OnZombied(DiscordClient sender, ZombiedEventArgs e)
        {
            _Logger?.LogCritical($"{sender.CurrentUser.Username} is still dead! Failed to respond to heartbeat. Recieved {e.Failures} Failed Heartbeats.");
            throw new Exception($"{sender.CurrentUser.Username} is still dead! Failed to respond to heartbeat. Recieved {e.Failures} Failed Heartbeats.");
        }

        private Task OnHeartbeat(DiscordClient sender, HeartbeatEventArgs e)
        {
            _Logger?.LogInformation($"{sender.CurrentUser.Username} is still alive! Ping is {e.Ping} ms to Discord servers");
            return Task.CompletedTask;
        }

        private Task OnGuildUnavailable(DiscordClient sender, GuildDeleteEventArgs e)
        {
            _Logger?.LogDebug($"Guild Id: {e.Guild.Id} Guild Name: {e.Guild.Name} is Unavailable!");
            return Task.CompletedTask;
        }

        private Task OnGuildDownloadComplete(DiscordClient sender, GuildDownloadCompletedEventArgs e)
        {
            // Logs the bot name and all the servers that it's connected to
            _Logger?.LogInformation($"Connected to these servers as '{sender.CurrentUser.Username}': ");
            foreach (var guild in sender.Guilds)
                _Logger?.LogInformation($"\t Guild Id: {guild.Key} Guild Name: {guild.Value.Name}");
            return Task.CompletedTask;
        }

        private Task OnGuildAvailable(DiscordClient sender, GuildCreateEventArgs e)
        {
            _Logger?.LogDebug($"Guild Id: {e.Guild.Id} Guild Name: {e.Guild.Name} is Available!");
            return Task.CompletedTask;
        }

        private Task OnReady(DiscordClient sender, ReadyEventArgs e)
        {
            _Logger?.LogInformation($"{sender.CurrentUser.Username} is ready!");
            return Task.CompletedTask;
        }

        public Task StopAsync()
        {
            if (_Client != null)
            {
                this._Client.DisconnectAsync();
            }
            return Task.CompletedTask;
        }

    }
}
