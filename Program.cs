using Serilog;

namespace SchedulingAssistant
{
    internal class Program
    {
        public static void Main(string[] args = null)
        {
            while (true)
            {
#if DEBUG
                Log.Logger = new LoggerConfiguration()
                                 .WriteTo.File("Logs/duinbot.log", rollingInterval: RollingInterval.Day)
                                 .WriteTo.Console(outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff} [{SourceContext}] [{Level}] {Message}{NewLine}{Exception}")
                                 .MinimumLevel.Debug()
                                 .CreateLogger();
#else
                Log.Logger = new LoggerConfiguration()
                                 .WriteTo.File("Logs/duinbot.log", rollingInterval: RollingInterval.Day)
                                 .WriteTo.Console(outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff} [{SourceContext}] [{Level}] {Message}{NewLine}{Exception}")
                                 .MinimumLevel.Information()
                                 .CreateLogger();
#endif

                try
                {
                    var KEY = Environment.GetEnvironmentVariable("DISCORD_BOT_TOKEN") ?? "";
                    new Bot().StartAsync(KEY).GetAwaiter().GetResult();
                }
                catch (Exception ex)
                {
                    Log.Logger.Error(ex.Message);
                }
            }

        }
    }
}
