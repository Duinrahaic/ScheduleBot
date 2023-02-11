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

        public Task Initalize()
        {
            _logger.LogInformation("Initializing Database Handler!");
            using (var db = new DBEntities())
            {
                db.Database.EnsureCreated();
                db.Database.Migrate();
            }
            _logger.LogInformation("Database Handler Has Started!");
            return Task.CompletedTask;
        }

        
    }
}
