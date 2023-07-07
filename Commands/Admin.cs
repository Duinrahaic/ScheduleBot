using CsvHelper;
using DSharpPlus;
using DSharpPlus.Entities;
using DSharpPlus.SlashCommands;
using DSharpPlus.SlashCommands.Attributes;
using Microsoft.Extensions.Logging;
using MySqlX.XDevAPI;
using SchedulingAssistant.Entities;
using SchedulingAssistant.Models;
using SchedulingAssistant.Services;
using System.Formats.Asn1;
using System.Globalization;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using static System.Net.Mime.MediaTypeNames;


namespace SchedulingAssistant.Commands
{
    public class Admin : ApplicationCommandModule
    {
        [SlashCommand("refesh", "Refreshes the UI of the schedules that haven't ended. Purely to fix the UI.")]
        [SlashRequireUserPermissions(Permissions.ManageMessages | Permissions.Administrator | Permissions.All)]
        public async Task Refresh(InteractionContext ctx)
        {
            await ctx.CreateResponseAsync($"Working on it!", true);

            using (var db = new DBEntities())
            {
                ServerSetting? Server = db.ServerSettings.FirstOrDefault(x => x.ServerId == ctx.Guild.Id);

                if (Server == null)
                {
                    await ctx.CreateResponseAsync($"No channel set. Use setEventChannel.", true);
                    return;
                }

                IEnumerable<DiscordChannel> Channels = await ctx.Guild.GetChannelsAsync();
                DiscordChannel? Channel = Channels.FirstOrDefault(x => x.Id == Server.ChannelId);

                if (Channel == null)
                {
                    await ctx.CreateResponseAsync($"No channel set. Use setEventChannel.", true);
                    return;
                }


                var schedules = db.Schedules.Where(x => (x.ServerId == ctx.Guild.Id) && (x.HasEnded == false)).ToList();

                foreach (var schedule in schedules)
                {
                    try
                    {

                        DiscordMessage? message = await Channel.GetMessageAsync(schedule.EventId);
                        if (message != null)
                        {
                            await message.ModifyAsync(schedule.BuildMessage());
                        }
                    }
                    catch (Exception ex)
                    {

                    }
                }
            }
        }




        [SlashCommand("setEventChannel", "Set Channel for Events.")]
        [SlashRequireUserPermissions(Permissions.ManageMessages | Permissions.Administrator | Permissions.All)]
        public async Task SetEventChannel(InteractionContext ctx, [Option("Channel", "Channel for bot to post events", false)] DiscordChannel Channel)
        {
            using (var db = new DBEntities())
            {
                var ServerSetting = db.ServerSettings.FirstOrDefault(x => x.ServerId == ctx.Guild.Id) ?? new ServerSetting(ctx.Guild.Id);
                ServerSetting.ChannelId = Channel.Id;

                try
                {
                    await ServerSetting.Update();
                    await ctx.CreateResponseAsync($"Now posting events in {Channel.Mention}", true);
                }
                catch (Exception ex)
                {
                    await ctx.CreateResponseAsync($"There was an error updating your server setting", true);
                    throw ex;
                }
            }
        }

        [SlashCommand("getAttendanceReport", "Gets attendance report for a date range.")]
        [SlashRequireUserPermissions(Permissions.ManageMessages | Permissions.Administrator | Permissions.All)]
        public async Task GetAttendanceReport(
            InteractionContext ctx,
            [Option("StartDate", "Date to start the report", false)] string StartDateForEvent,
            [Option("EndDate", "Date to end the report", false)] string EndDateForEvent,
            [Option("TimeZone", "Fully Written Time Zone", false)] string TimeZoneName
        )
        {
            DateTime? StartTime = null;
            DateTime? EndTime = null;

            try
            {
                StartTime = DateTime.Parse(StartDateForEvent);
            }
            catch
            {
                await ctx.CreateResponseAsync($"Not a valid Start Time Format", true);
                return;
            }
            try
            {
                EndTime = DateTime.Parse(EndDateForEvent);
            }
            catch
            {
                await ctx.CreateResponseAsync($"Not a valid End Time Format", true);
                return;
            }
            try
            {
                _ = TimeZoneInfo.FindSystemTimeZoneById(TimeZoneName);
            }
            catch
            {
                await ctx.CreateResponseAsync($"Not a valid Time Zone. Use fully qualified name and not code.", true);
                return;
            }
            TimeZoneInfo TZI = TimeZoneInfo.FindSystemTimeZoneById(TimeZoneName);
            StartTime = TimeZoneInfo.ConvertTime((DateTime)StartTime, TZI, TimeZoneInfo.Local);
            EndTime = TimeZoneInfo.ConvertTime((DateTime)EndTime, TZI, TimeZoneInfo.Local);

            await ctx.CreateResponseAsync($"Getting your report. Hold tight...", true);

            try
            {
                using (var db = new DBEntities())
                {
                    var Schedules = db.Schedules.Where(x => x.HasEnded == true && x.StartTime >= StartTime && x.EndTime <= EndTime).ToList();
                    List<int> ScheduleIds = Schedules.Select(x => x.Id).ToList();
                    var Attendees = db.Attenants.Where(x => ScheduleIds.Contains(x.ScheduleId)).ToList();

                    var dm = await ctx.Member.CreateDmChannelAsync();
                    var message = await dm.SendMessageAsync("Getting your report. Hold tight...");
                    DiscordMessageBuilder DMB = new DiscordMessageBuilder();

                    List<ReportOutput> Output = new();

                    foreach (var s in Schedules)
                    {
                        var ScheduleStartTime = TimeZoneInfo.ConvertTime((DateTime)s.StartTime, TimeZoneInfo.Local, TZI);
                        foreach (var a in Attendees.Where(x => x.ScheduleId == s.Id))
                        {
                            Output.Add(new()
                            {
                                EventId = s.EventId,
                                Date = ScheduleStartTime,
                                Description = s.EventDescription,
                                Name = s.EventTitle,
                                UserId = a.UserId,
                                UserName = a.Name
                            });
                        }
                    }


                    if (Output.Count == 0)
                    {
                        DMB.WithContent("There are no events in that time range");
                        await message.ModifyAsync(DMB);

                    }
                    else
                    {
                        DMB.WithContent("Here you go!");
                        string filePath = $"{ctx.InteractionId}.csv";

                        //string csv = String.Join(",", Output);
                        //FileStream fWrite = new FileStream(filePath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.ReadWrite);

                        //byte[] writeArr = Encoding.UTF8.GetBytes(csv); 
                        //await fWrite.WriteAsync(writeArr, 0, csv.Length);
                        //fWrite.Close();

                        using (var writer = new StreamWriter(filePath))
                        using (var csvF = new CsvWriter(writer, CultureInfo.InvariantCulture))
                        {
                            csvF.WriteRecords(Output);
                        }



                        using (var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read))
                        {
                            var dmb = new DiscordMessageBuilder()
                                .WithContent("Here is your report!")
                                .AddFile(fs, false);
                            await message.ModifyAsync(dmb);
                        }


                        if (File.Exists(filePath))
                        {
                            File.Delete(filePath);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                await ctx.CreateResponseAsync($"There was an error getting your report", true);
                throw ex;
            }
        }



        [SlashCommand("version", "Get Schedulebot Version.")]
        [SlashRequireUserPermissions(Permissions.ManageMessages | Permissions.Administrator | Permissions.All)]
        public async Task GetVersion(InteractionContext ctx)
        {
            await ctx.CreateResponseAsync(@$"I am running version {Assembly.GetEntryAssembly().GetName().Version}", true);
        }


        [SlashCommand("restartEvent", "Restarts Event.")]
        [SlashRequireUserPermissions(Permissions.ManageMessages | Permissions.Administrator | Permissions.All)]
        public async Task RestartEvent(
            InteractionContext ctx,
            [Option("EventId", "The ID of the Event", false)] string MessageId
        )
        {
            Regex R = new Regex(@"([0-9]*)");

            if (!R.IsMatch(MessageId))
            {
                await ctx.CreateResponseAsync($"Not a valid message Id", true);
                return;
            }

            using (var db = new DBEntities())
            {
                var ServerSetting = db.ServerSettings.FirstOrDefault(x => x.ServerId == ctx.Guild.Id) ?? new ServerSetting(ctx.Guild.Id);
                if (ServerSetting.ChannelId == null)
                {
                    await ctx.CreateResponseAsync($"No Event Channel Set. Have admin set channel using /setEventChannel", true);
                    return;
                }

                Schedule? Schedule = null;

                try
                {
                    ulong EventId = ulong.Parse(R.Match(MessageId).Value);

                    Schedule = db.Schedules.FirstOrDefault(x => x.EventId == EventId);
                    if (Schedule == null)
                    {
                        await ctx.CreateResponseAsync($"Unable to get an event of that Id", true);
                        return;
                    }
                }
                catch
                {
                    await ctx.CreateResponseAsync($"Unable to get an event of that Id", true);
                    return;
                }
                DiscordRole? DiscordRole = null;

                if (Schedule.HasEnded == true)
                {
                    var RoleName =  Environment.GetEnvironmentVariable("DISCORD_EVENT_ROLE_PREFIX") ?? "EventRole";
                    int i = 0;
                    do
                    {
                        i++;
                        RoleName = $"V{RoleName}-{i}";
                    }
                    while (ctx.Guild.Roles.Values.FirstOrDefault(x => x.Name == RoleName) != null);

                    DiscordRole = await ctx.Guild.CreateRoleAsync(RoleName);
                }
                else
                {
                    DiscordRole = ctx.Guild.Roles.Values.FirstOrDefault(x => x.Id == Schedule.RoleId);
                }


                if (DiscordRole == null)
                {
                    await ctx.CreateResponseAsync($"Unable to create role. Check Permissions as this role already exists.", true);
                    return;
                }

                Schedule.RoleId = DiscordRole.Id;
                Schedule.IsActive = false;
                Schedule.HasEnded = false;

                try
                {
                    DiscordMessageBuilder MBuilder = Schedule.BuildMessage();
                    try
                    {
                        var Message = await ctx.Guild.GetChannel((ulong)ServerSetting.ChannelId).GetMessageAsync(Schedule.EventId);
                        await Message.ModifyAsync(MBuilder);
                        await Schedule.Update();


                        List<Attendence> Attendees = db.Attenants.Where(x => x.ScheduleId == Schedule.Id).ToList();
                        foreach (var User in Attendees)
                        {
                            DiscordMember? DM = await ctx.Guild.GetMemberAsync(User.UserId);
                            if (DM != null)
                            {
                                await DM.GrantRoleAsync(DiscordRole);
                            }
                        }
                        await ctx.CreateResponseAsync($"Here you go!", true);
                    }
                    catch (Exception ex)
                    {
                        await ctx.CreateResponseAsync($"There was an error updating your event.", true);
                    }
                }
                catch
                {
                    await DiscordRole.DeleteAsync();
                    await ctx.CreateResponseAsync($"There was an error restarting your event.", true);

                }



            }
        }






        [SlashCommand("Event", "Post Event.")]
        [SlashRequireUserPermissions(Permissions.ManageMessages | Permissions.Administrator | Permissions.All)]
        public async Task PostEvent(
            InteractionContext ctx,
            [Option("Name", "Name of the event", false)] string EventName,
            [Option("Description", "Event Detials", false)] string Description,
            [Option("EventStart", "When the event occurs", false)] string EventStart,
            [Option("Duration", "How many hours till this event ends?", false)] double EventEnd,
            [Option("ProfileURL", "VRC Profile User Hosting Event", false)] string HostURL,
            [Option("World", "Link to world", false)] string WorldLink = "",
            [Option("Host", "User Hosting Event", false)] DiscordUser Host = null,
            [Option("TimeZone", "Fully Written Time Zone", false)] string TimeZoneName = "Coordinated Universal Time",
            [Option("ImageURL", "Image URL", false)] string Image = null
            )
        {

            using (var db = new DBEntities())
            {
                var ServerSetting = db.ServerSettings.FirstOrDefault(x => x.ServerId == ctx.Guild.Id) ?? new ServerSetting(ctx.Guild.Id);
                if (ServerSetting.ChannelId == null)
                {
                    await ctx.CreateResponseAsync($"No Event Channel Set. Have admin set channel using /setEventChannel", true);
                    return;
                }
                DateTime? StartTime = null;
                DateTime? EndTime = null;

                try
                {
                    Regex TimeCode = new Regex(@"\<t:(\d*):[a-zA-Z]{1}\>");
                    if (TimeCode.IsMatch(EventStart))
                    {
                        long unixTimeStamp = long.Parse(TimeCode.Match(EventStart).Groups[1].Value);
                        System.DateTime dtDateTime = new DateTime(1970, 1, 1, 0, 0, 0, 0, System.DateTimeKind.Utc);
                        StartTime = dtDateTime.AddSeconds(unixTimeStamp);
                    }
                    else
                    {
                        StartTime = DateTime.Parse(EventStart);
                    }
                }
                catch
                {
                    await ctx.CreateResponseAsync($"Not a valid Start Time Format", true);
                    return;
                }
                try
                {
                    EndTime = StartTime.Value.AddHours(EventEnd);
                }
                catch
                {
                    await ctx.CreateResponseAsync($"Not a valid End Time Format", true);
                    return;
                }
                try
                {
                    var TMZ = TimeZoneInfo.GetSystemTimeZones().FirstOrDefault(x => x.DisplayName.Contains(TimeZoneName));
                    if (TMZ == null)
                    {
                        await ctx.CreateResponseAsync($"Not a valid Time Zone. Use fully qualified name and not code.", true);
                    }
                }
                catch
                {
                    await ctx.CreateResponseAsync($"Not a valid Time Zone. Use fully qualified name and not code.", true);
                    return;
                }

                try
                {
                    Regex URL = new Regex(@"^http:\/\/|^https:\/\/");
                    if (!URL.IsMatch(HostURL))
                    {
                        await ctx.CreateResponseAsync(@$"Not a valid Host URL. Ensure link starts with http:// or https://", true);
                        return;
                    }
                    if (!string.IsNullOrEmpty(WorldLink))
                    {
                        if (!URL.IsMatch(WorldLink))
                        {
                            await ctx.CreateResponseAsync(@$"Not a valid World Link. Ensure link starts with http:// or https://", true);
                            return;
                        }
                    }
                    if (!string.IsNullOrEmpty(Image))
                    {
                        if (!URL.IsMatch(Image))
                        {
                            await ctx.CreateResponseAsync(@$"Not a valid Image Link. Ensure link starts with http:// or https://", true);
                            return;
                        }
                    }

                }
                catch
                {
                    await ctx.CreateResponseAsync(@$"Not a valid Image, Host or World URL. Ensure link starts with http:// or https://", true);
                    return;
                }




                var RoleName = Environment.GetEnvironmentVariable("DISCORD_EVENT_ROLE_PREFIX") ?? "EventRole";
                int i = 0;
                do
                {
                    i++;
                    RoleName = $"{RoleName }-{i}";
                }
                while (ctx.Guild.Roles.Values.FirstOrDefault(x => x.Name == RoleName) != null);

                DiscordRole? DiscordRole = await ctx.Guild.CreateRoleAsync(RoleName);
                if (DiscordRole == null)
                {
                    await ctx.CreateResponseAsync($"Unable to create role. Check Permissions as this role already exists.", true);
                    return;
                }

                ulong? HostId = null;
                string? HostName = null;
                if (Host == null)
                {
                    HostId = (ulong)0;
                    HostName = "clear";
                }
                else
                {
                    if (Host.IsBot)
                    {
                        HostId = (ulong)0;
                        HostName = "clear";
                    }
                    else
                    {
                        HostId = Host.Id;
                        HostName = Host.Username;
                    }
                }


                try
                {
                    Schedule NewEvent = new((DateTime)StartTime, (DateTime)EndTime, ctx.Guild.Id, EventName, HostURL, (ulong)DiscordRole.Id, HostId: (ulong)HostId, HostName: HostName, TimeZone: TimeZoneName, WorldLink: WorldLink, EventDescription: Description, ImageURL: Image);
                    await NewEvent.Update();

                    var dbEvent = db.Schedules.FirstOrDefault(x => x.RoleId == (ulong)DiscordRole.Id);
                    if (dbEvent != null)
                    {
                        DiscordMessageBuilder MBuilder = dbEvent.BuildMessage();

                        try
                        {
                            var Message = await ctx.Guild.GetChannel((ulong)ServerSetting.ChannelId).SendMessageAsync(MBuilder);
                            dbEvent.EventId = Message.Id;
                            await dbEvent.Update();
                        }
                        catch
                        {
                            await ctx.CreateResponseAsync($"There was an error making your event.", true);

                        }
                    }
                    await ctx.CreateResponseAsync($"Here you go!", true);

                }
                catch
                {
                    await DiscordRole.DeleteAsync();
                    await ctx.CreateResponseAsync($"There was an error making your event.", true);

                }
            }
        }


        [SlashCommand("Edit", "Edit Event.")]
        [SlashRequireUserPermissions(Permissions.ManageMessages | Permissions.Administrator | Permissions.All)]
        public async Task Edit(
            InteractionContext ctx,
            [Option("EventId", "The ID of the Event", false)] string MessageId,
            [Option("Name", "Name of the event", false)] string EventName = null,
            [Option("Description", "Event Detials", false)] string Description = null,
            [Option("EventStart", "When the event occurs", false)] string EventStart = null,
            [Option("Duration", "How many hours till this event ends?", false)] double EventEnd = 0.0,
            [Option("Host", "User Hosting Event. Tag bot to remove clear role.", false)] DiscordUser Host = null,
            [Option("ProfileURL", "VRC Profile User Hosting Event", false)] string HostURL = null,
            [Option("World", "Link to world. Type 'clear' to remove link", false)] string? WorldLink = null,
            [Option("TimeZone", "Fully Written Time Zone", false)] string TimeZoneName = null,
            [Option("ImageURL", "Image URL. Type \'clear\' to remove link", false)] string Image = null
            )
        {
            Regex R = new Regex(@"([0-9]*)");

            if (!R.IsMatch(MessageId))
            {
                await ctx.CreateResponseAsync($"Not a valid message Id", true);
                return;
            }

            using (var db = new DBEntities())
            {
                var ServerSetting = db.ServerSettings.FirstOrDefault(x => x.ServerId == ctx.Guild.Id) ?? new ServerSetting(ctx.Guild.Id);
                if (ServerSetting.ChannelId == null)
                {
                    await ctx.CreateResponseAsync($"No Event Channel Set. Have admin set channel using /setEventChannel", true);
                    return;
                }

                Schedule? Schedule = null;

                try
                {
                    ulong EventId = ulong.Parse(R.Match(MessageId).Value);

                    Schedule = db.Schedules.FirstOrDefault(x => x.EventId == EventId);
                    if (Schedule == null)
                    {
                        await ctx.CreateResponseAsync($"Unable to get an event of that Id", true);
                        return;
                    }
                }
                catch
                {
                    await ctx.CreateResponseAsync($"Unable to get an event of that Id", true);
                    return;
                }

                if (!string.IsNullOrEmpty(EventName))
                {
                    Schedule.EventTitle = EventName;
                }

                if (!string.IsNullOrEmpty(Description))
                {
                    Schedule.EventDescription = Description;
                }


                if (!string.IsNullOrEmpty(EventStart))
                {
                    try
                    {
                        DateTime? StartTime = null;
                        Regex TimeCode = new Regex(@"\<t:(\d*):[a-zA-Z]{1}\>");
                        if (TimeCode.IsMatch(EventStart))
                        {

                            long unixTimeStamp = long.Parse(TimeCode.Match(EventStart).Groups[1].Value);
                            System.DateTime dtDateTime = new DateTime(1970, 1, 1, 0, 0, 0, 0, System.DateTimeKind.Utc);
                            StartTime = dtDateTime.AddSeconds(unixTimeStamp);
                        }
                        else
                        {
                            StartTime = DateTime.Parse(EventStart);
                        }
                        Schedule.StartTime = StartTime.Value;
                    }
                    catch
                    {
                        await ctx.CreateResponseAsync($"Not a valid Start Time Format", true);
                        return;
                    }
                }

                if (EventEnd > 0)
                {
                    try
                    {
                        DateTime? EndTime = null;
                        EndTime = Schedule.StartTime.AddHours((double)EventEnd);
                        Schedule.EndTime = EndTime.Value;
                    }
                    catch
                    {
                        await ctx.CreateResponseAsync($"Not a valid End Time Format", true);
                        return;
                    }
                }


                if (TimeZoneName != null)
                {
                    try
                    {
                        var TMZ = TimeZoneInfo.GetSystemTimeZones().FirstOrDefault(x => x.DisplayName.Contains(TimeZoneName));
                        if (TMZ == null)
                        {
                            await ctx.CreateResponseAsync($"Not a valid Time Zone. Use fully qualified name and not code.", true);
                        }
                    }
                    catch
                    {
                        await ctx.CreateResponseAsync($"Not a valid Time Zone. Use fully qualified name and not code.", true);
                        return;
                    }

                    Schedule.TimeZone = TimeZoneName;
                }




                try
                {
                    Regex URL = new Regex(@"^http:\/\/|^https:\/\/");
                    if (!string.IsNullOrEmpty(HostURL))
                    {
                        if (!URL.IsMatch(HostURL))
                        {
                            await ctx.CreateResponseAsync(@$"Not a valid Host URL. Ensure link starts with http:// or https://", true);
                            return;
                        }
                        Schedule.HostURL = HostURL;
                    }


                    if (!string.IsNullOrEmpty(WorldLink))
                    {
                        if (WorldLink.Trim().ToLower() == "clear")
                        {
                            Schedule.WorldLink = null;
                        }
                        else
                        {
                            if (!URL.IsMatch(WorldLink))
                            {
                                await ctx.CreateResponseAsync(@$"Not a valid World Link. Ensure link starts with http:// or https://", true);
                                return;
                            }
                            Schedule.WorldLink = WorldLink;
                        }
                    }

                    if (!string.IsNullOrEmpty(Image))
                    {
                        if (Image.Trim().ToLower() == "clear")
                        {
                            Schedule.ImageURL = null;
                        }
                        else
                        {
                            if (!URL.IsMatch(Image))
                            {
                                await ctx.CreateResponseAsync(@$"Not a valid Image Link. Ensure link starts with http:// or https://", true);
                                return;
                            }
                            Schedule.ImageURL = Image;
                        }
                    }
                }
                catch
                {
                    await ctx.CreateResponseAsync(@$"Not a valid Image, Host or World URL. Ensure link starts with http:// or https://", true);
                    return;
                }



                if (Host != null)
                {
                    if (Host.IsBot == true)
                    {
                        Schedule.HostId = (ulong)0;
                        Schedule.HostName = "clear";
                    }
                    else
                    {
                        Schedule.HostId = Host.Id;
                        Schedule.HostName = Host.Username;
                    }
                }

                try
                {
                    DiscordMessageBuilder MBuilder = Schedule.BuildMessage();
                    try
                    {
                        var Message = await ctx.Guild.GetChannel((ulong)ServerSetting.ChannelId).GetMessageAsync(Schedule.EventId);
                        await Message.ModifyAsync(MBuilder);
                        await Schedule.Update();
                        await ctx.CreateResponseAsync($"Here you go!", true);
                    }
                    catch
                    {
                        await ctx.CreateResponseAsync($"There was an error updating your event.", true);
                    }
                }
                catch
                {
                    await ctx.CreateResponseAsync($"There was an error updating your event.", true);

                }
            }
        }
    }
}
