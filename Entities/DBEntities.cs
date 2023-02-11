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
            string DBType = Environment.GetEnvironmentVariable("DISCORD_BOT_DB_TYPE") ?? "Sqlite";
            string ConnectionString = Environment.GetEnvironmentVariable("DISCORD_BOT_CONNECTION_STRING") ?? "";



            if (string.IsNullOrEmpty(ConnectionString) && !DBType.ToLower().Equals("sqlite"))
            {
                throw new ArgumentNullException($"Undefined Environment Variable 'CONNECTION_STRING' found when attempting to setup Duinbot Entities. Please resolve.");
            }



            if (DBType.ToLower() == "sqlite")
            {
                UseSqlite(optionsBuilder);
            }
            else if (DBType.ToLower() == "mysql")
            {
                UseMySQL(optionsBuilder, ConnectionString);
            }
            else
            {
                throw new ArgumentException("Unknown Database Type. Please select from SqLite or MySQL");
            }

        }

        protected void UseSqlite(DbContextOptionsBuilder optionsBuilder)
        {
            Directory.CreateDirectory("Data");
            var connectionStringBuilder = new SqliteConnectionStringBuilder { DataSource = @"Data/duinbot.db" };
            var connectionString = connectionStringBuilder.ToString();
            var connection = new SqliteConnection(connectionString);
            optionsBuilder.UseSqlite(connection);
        }

        protected void UseMySQL(DbContextOptionsBuilder optionsBuilder, string ConnectionString)
        {
            var serverVersion = new MySqlServerVersion(new Version(8, 0, 26));
            optionsBuilder.UseMySql(ConnectionString, serverVersion);
        }
    }
}
