using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SchedulingAssistant.Entities;

namespace SchedulingAssistant.Services
{
    internal class DatabaseHandler
    {
        private readonly IServiceProvider _services;
        private readonly ILogger<DatabaseHandler> _logger;

        public DatabaseHandler(IServiceProvider services)
        {
            _services = services;
            _logger = _services.GetRequiredService<ILogger<DatabaseHandler>>();
        }

        public async Task Initalize()
        {
            _logger.LogInformation("Initializing Database Handler!");
            do
            {
                try
                {
                    using (var db = new DBEntities())
                    {
                        if(db != null)
                        {
                            if(db.Database != null)
                            {
                                _logger.LogInformation("Attempting to connect to database using connection string: {0}", db.Database.GetConnectionString() ?? "");
                                db.Database.OpenConnection();
                                db.Database.EnsureCreated();
                            }
                            
                        }
                    }
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to connect to database. Retrying in 5 seconds.");
                    await Task.Delay(5000);
                }
            } while (true);

            _logger.LogInformation("Database Handler Has Started!");
        }

        
    }
}
