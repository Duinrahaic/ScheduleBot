using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MySql.Data.MySqlClient;
using MySqlConnector;
using Pomelo.EntityFrameworkCore;

namespace SchedulingAssistant.Entities
{
    public partial class DBEntities : DbContext
    {
        public virtual DbSet<Schedule> Schedules { get; set; }
        public virtual DbSet<Attendence> Attenants { get; set; }
        public virtual DbSet<ServerSetting> ServerSettings { get; set; }

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            string ConnectionString = Environment.GetEnvironmentVariable("DISCORD_BOT_CONNECTION_STRING") ?? "";

            if (string.IsNullOrEmpty(ConnectionString))
            {
                string Server = Environment.GetEnvironmentVariable("MYSQL_SERVER") ?? "scheduleBot-db";
                string DB = Environment.GetEnvironmentVariable("MYSQL_DB") ?? "ScheduleBot";
                string User = Environment.GetEnvironmentVariable("MYSQL_USER") ?? "schedulebot";
                string Pass = Environment.GetEnvironmentVariable("MYSQL_USER_PW") ?? "schedulebot";
                ConnectionString = "server=" + Server + ";user=" + User + ";password=" + Pass + ";database=" + DB + ";";
            }
            
            var serverVersion = new MySqlServerVersion(new Version(8, 0, 26));
            optionsBuilder.UseMySql(ConnectionString, serverVersion);
        }
    }
}
