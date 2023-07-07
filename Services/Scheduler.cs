using DSharpPlus;
using DSharpPlus.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SchedulingAssistant.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using System.Timers;
namespace SchedulingAssistant.Services
{
    internal class Scheduler
    {
        private readonly IServiceProvider _services;
        private readonly ILogger<Scheduler> _logger;
        private readonly DiscordClient _client;
        private System.Timers.Timer? HeartBeatTimer;

        public Scheduler(IServiceProvider services)
        {
            _services = services;
            _client = _services.GetRequiredService<DiscordClient>();
            _logger = _services.GetRequiredService<ILogger<Scheduler>>();
        }

        public Task Initalize()
        {
            _logger.LogInformation("Initializing Scheduler!");
            if (HeartBeatTimer == null)
            {
                HeartBeatTimer = new();
                HeartBeatTimer.Stop();
                HeartBeatTimer.AutoReset = true;
                HeartBeatTimer.Elapsed += HeartBeatTimer_Elapsed;
                HeartBeatTimer.Interval = 1000 * 60 * 1; // Every 1 Minutes
                HeartBeatTimer.Start();
            }
            _logger.LogInformation("Scheduler Has Started!");
            return Task.CompletedTask;
        }



        //Truth Table:
        // IsActive == false && HasEnded == false: New Event
        // IsActive == true && HasEnded == false: Has Been Scheduled
        // IsActive == true && HasEnded == true: Has Ended 
        // IsActive == false && HasEneded == true: Event has ended and the role is deleted
        private void HeartBeatTimer_Elapsed(object? sender, ElapsedEventArgs e)
        {
            using (var db = new DBEntities())
            {

                List<ServerSetting> servers = db.ServerSettings.ToList();
                var dt = DateTime.Now.ToUniversalTime();

                // Schedule
                List<Schedule> schedules = new List<Schedule>();

                //Get Schedule an hour before
                schedules = db.Schedules.Where(x => x.HasEnded == false && x.IsActive == false && x.ThreadId == null).ToList();
                List<Schedule> PreStartSchedules = schedules.Where(x => x.StartTime <= dt.AddHours(1)).ToList();
                if (PreStartSchedules.Count > 0)
                {
                    foreach (var schedule in PreStartSchedules)
                    {
                        var Server = servers.FirstOrDefault(x => x.ServerId == schedule.ServerId);
                        if (Server != null)
                        {
                            if (Server.ChannelId != null)
                            {
                                var channel = _client.GetChannelAsync((ulong)Server.ChannelId).GetAwaiter().GetResult();
                                try
                                {
                                    var message = channel.GetMessageAsync(schedule.EventId).GetAwaiter().GetResult();
                                    var thread = channel.CreateThreadAsync(message, $"{schedule.EventTitle}", AutoArchiveDuration.Day).GetAwaiter().GetResult();
                                    schedule.ThreadId = thread.Id;
                                    schedule.IsActive = true;
                                    thread.SendMessageAsync($"Hey <@&{schedule.RoleId}>! The event \"{schedule.EventTitle}\" starts soon! \n 🕑 {schedule.GetDiscordFormattedTimeStart()}");
                                }
                                catch
                                {
                                    schedule.ThreadId = 0;
                                    schedule.IsActive = true;
                                }
                            }

                        }

                    }
                    db.SaveChanges();
                }

                //List<Schedule> StartSchedules = db.Schedules.Where(x => x.HasEnded == false && x.IsActive == false && x.ThreadId !=null && x.StartTime <= DateTime.Now).ToList();
                //foreach (var schedule in PreStartSchedules)
                //{
                //    var channel = _client.GetChannelAsync(1).GetAwaiter().GetResult();
                //    var message = channel.GetMessageAsync(schedule.EventId).GetAwaiter().GetResult();
                //    var thread = channel.CreateThreadAsync(message, $"{schedule.EventTitle} Discussion", AutoArchiveDuration.Week).GetAwaiter().GetResult();
                //    schedule.ThreadId = thread.Id;
                //    thread.SendMessageAsync($"Hey <@&{schedule.RoleId}>! The event \"{schedule.EventTitle}\" has started!");
                //}


                // Event when it's ended
                schedules = db.Schedules.Where(x => x.HasEnded == false && x.IsActive == true).ToList();
                List<Schedule> EndSchedules = schedules.Where(x => x.EndTime <= dt).ToList();
                if (EndSchedules.Count > 0)
                {
                    foreach (var schedule in EndSchedules)
                    {
                        var Server = servers.FirstOrDefault(x => x.ServerId == schedule.ServerId);
                        if (Server != null)
                        {
                            if (Server.ChannelId != null)
                            {
                                var channel = _client.GetChannelAsync((ulong)Server.ChannelId).GetAwaiter().GetResult();
                                try
                                {
                                    var message = channel.GetMessageAsync(schedule.EventId).GetAwaiter().GetResult();
                                    message.ModifyAsync(schedule.BuildMessage(withInteractions: false));
                                }
                                catch { }

                                if (schedule.ThreadId != null)
                                {
                                    try
                                    {
                                        var thread = channel.Threads.FirstOrDefault(x => x.Id == (ulong)schedule.ThreadId);
                                        if (thread != null)
                                        {
                                            thread.SendMessageAsync($"The event is now over - Thank you so much for your attendance!").GetAwaiter();
                                        }
                                    }
                                    catch
                                    {

                                    }

                                }
                                schedule.IsActive = true;
                                schedule.HasEnded = true;
                            }

                        }

                    }

                    db.SaveChanges();
                }



                // Event when it's ended 1 hour after
                schedules = db.Schedules.Where(x => x.HasEnded == true && x.IsActive == true).ToList();
                List<Schedule> DeleteRoleSchedules = schedules.Where(x => x.EndTime.AddHours(1).ToUniversalTime() <= dt).ToList();
                if (DeleteRoleSchedules.Count > 0)
                {
                    foreach (var schedule in DeleteRoleSchedules)
                    {
                        var Server = servers.FirstOrDefault(x => x.ServerId == schedule.ServerId);
                        if (Server != null)
                        {
                            if (schedule.RoleId != null)
                            {
                                if (Server.ChannelId != null)
                                {
                                    var channel = _client.GetChannelAsync((ulong)Server.ChannelId).GetAwaiter().GetResult();
                                    ulong DiscordRoleId = (ulong)schedule.RoleId;
                                    DiscordRole? DiscordRole = channel.Guild.GetRole(DiscordRoleId);
                                    if (DiscordRole != null)
                                    {
                                        DiscordRole.DeleteAsync().GetAwaiter();
                                    }
                                    schedule.IsActive = false;
                                }
                            }
                        }
                    }
                    db.SaveChanges();
                }
            }
        }
    }
}
