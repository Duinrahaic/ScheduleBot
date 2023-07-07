using DSharpPlus;
using DSharpPlus.Entities;
using SchedulingAssistant.Models;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using SchedulingAssistant.Utilities;
using System.ComponentModel.DataAnnotations.Schema;

namespace SchedulingAssistant.Entities
{
    public partial class Schedule
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }
        public DateTime StartTime { get; set; }
        public DateTime EndTime { get; set; }
        public string TimeZone { get; set; }
        public ulong ServerId { get; set; }
        [Description("Message Id of the Event")]
        public ulong EventId { get; set; }
        [Description("Message Id of the Thread")]
        public ulong? ThreadId { get; set; }
        public string EventTitle { get; set; } = string.Empty;
        public string? EventDescription { get; set; }
        public string? WorldLink { get; set; }
        [Description("Id of the Host Role")]
        public ulong HostId { get; set; }
        [Description("Id of the Discord Role")]
        public ulong? RoleId { get; set; }
        [Description("Name of Host")]
        public string HostName { get; set; }
        public string HostURL { get; set; }
        public string? ImageURL { get; set; }
        //Truth Table:
        // IsActive == false && HasEnded == false: New Event
        // IsActive == true && HasEnded == false: Has Been Scheduled
        // IsActive == true && HasEnded == true: Has Ended 
        // IsActive == false && HasEneded == true: Event Deleted

        public bool IsActive { get; set; } = false;
        public bool HasEnded { get; set; } = false;


        public List<Attendence> Attendees { get; set; } = new List<Attendence>();

        public Schedule(DateTime StartTime, DateTime EndTime, ulong ServerId, string EventTitle, string HostURL, ulong? RoleId = null, ulong EventId = 0, ulong HostId = 0, string HostName = "clear", string? EventDescription = "", string? WorldLink = null, string TimeZone = "Coordinated Universal Time", string ImageURL = null)
        {
            if (TimeZone != null)
            {
                TimeZoneInfo TZI = TimeZoneInfo.GetSystemTimeZones().FirstOrDefault(x => x.DisplayName.Contains(TimeZone));
                this.StartTime = TimeZoneInfo.ConvertTime(StartTime, TZI, TimeZoneInfo.Local);
                this.EndTime = TimeZoneInfo.ConvertTime(EndTime, TZI, TimeZoneInfo.Local);
                this.TimeZone = TimeZone;
            }
            else
            {
                this.StartTime = StartTime;
                this.EndTime = EndTime;
                this.TimeZone = "Coordinated Universal Time";
            }

            this.ServerId = ServerId;
            this.EventTitle = EventTitle;
            this.EventId = EventId;
            this.HostId = HostId;
            this.RoleId = RoleId;
            this.EventDescription = EventDescription;
            this.WorldLink = WorldLink;
            this.HostName = HostName;
            this.HostURL = HostURL;
            this.ImageURL = ImageURL;
        }

        public async Task Update()
        {
            using (var db = new DBEntities())
            {
                var dbSchedule = db.Schedules.FirstOrDefault(x => x.Id == this.Id);
                if (dbSchedule != null)
                {
                    dbSchedule.StartTime = StartTime;
                    dbSchedule.EndTime = EndTime;
                    dbSchedule.TimeZone = TimeZone;
                    dbSchedule.ServerId = ServerId;
                    dbSchedule.EventId = EventId;
                    dbSchedule.Attendees = Attendees;
                    dbSchedule.ThreadId = ThreadId;
                    dbSchedule.EventTitle = EventTitle;
                    dbSchedule.EventDescription = EventDescription;
                    dbSchedule.HostId = HostId;
                    dbSchedule.RoleId = RoleId;
                    dbSchedule.WorldLink = WorldLink;
                    dbSchedule.HostName = HostName;
                    dbSchedule.Attendees = Attendees;
                    dbSchedule.IsActive = IsActive;
                    dbSchedule.HasEnded = HasEnded;
                    dbSchedule.HostURL = HostURL;
                    dbSchedule.ImageURL = ImageURL;
                }
                else
                {
                    db.Schedules.Add(this);
                }
                await db.SaveChangesAsync();
            }
        }




        public async Task<string> UpdateAttendee(ulong userId, string UserName, string State)
        {
            string Message = string.Empty;
            using (var db = new DBEntities())
            {
                var dbAttendance = db.Attenants.FirstOrDefault(x => (x.ScheduleId == this.Id) && (x.UserId == userId));
                if (dbAttendance == null)
                {
                    Attendence New = new Attendence(this.Id, userId, UserName, State);
                    db.Attenants.Add(New);
                    Message = $"{State}";
                }
                else
                {
                    if (dbAttendance.Status == State)
                    {
                        db.Remove(dbAttendance);
                        Message = $"Not {State}";
                    }
                    else
                    {
                        dbAttendance.Status = State;
                        Message = State;
                    }
                }
                await db.SaveChangesAsync();
            }
            return Message;
        }


        public async Task Delete()
        {
            using (var db = new DBEntities())
            {
                var dbSchedule = db.Schedules.FirstOrDefault(x => x.Id == this.Id);
                if (dbSchedule != null)
                {
                    db.Schedules.Remove(dbSchedule);
                    await db.SaveChangesAsync();
                }
            }
        }

        public DiscordMessageBuilder BuildMessage(bool withInteractions = true)
        {
            List<Attendence> Attendees = new List<Attendence>();
            using (var db = new DBEntities())
            {

                Attendees = db.Attenants.Where(x => x.ScheduleId == this.Id).ToList();
            }
            DiscordButtonComponent AcceptButton = new(ButtonStyle.Primary, $"Accept_{this.Id}", "✅");
            DiscordButtonComponent TentativeButton = new(ButtonStyle.Primary, $"Tentative_{this.Id}", "☑️");
            DiscordButtonComponent Delete = new(ButtonStyle.Danger, $"Delete_{this.Id}", "❌");

            DiscordEmbedBuilder Builder = new DiscordEmbedBuilder();
            Builder.Title = EventTitle;
            Builder.Description = EventDescription;

            if (ImageURL != null)
            {
                Builder.ImageUrl = ImageURL;
            }

            if (WorldLink != null)
            {
                Builder.WithUrl(WorldLink);
            }

            if (withInteractions)
            {
                Builder.AddField("Event Occurs", $"{GetDiscordFormattedTimeMessage()} \n 🕑 {GetDiscordFormattedTimeStart()}");
            }
            else
            {
                Builder.AddField("Event Occurs", $"{GetDiscordFormattedTimeMessage()} \n 🕑 Ended");
            }

            Builder.AddField("Google Calendar", $"[Add To Calendar]({GoogleCalendar.GetGoogleCalendarInvite(this.EventTitle, this.StartTime, this.EndTime, Description: this.EventDescription)})", false);

            if (HostName != "clear")
            {
                Builder.AddField("Host", $"<@{HostId}>", true);
            }


            Builder.AddField("Profile", $"[Here]({HostURL})", true);

            // Danger: Zero Width character:
            char ZWC = '\u200B';

            if (withInteractions)
            {
                Builder.AddField("Event Role", $"<@&{RoleId}>");
            }
            else
            {
                Builder.AddField($"{ZWC}", $"{ZWC}");
            }

            var AttendanceBuilder = Attendees.Where(x => x.Status == "Attending").Select(x => $"<@{x.UserId}>");
            var TentativeBuilder = Attendees.Where(x => x.Status == "Tentative").Select(x => $"<@{x.UserId}>");

            int Max = new List<int>() { AttendanceBuilder.Count(), TentativeBuilder.Count(), 1 }.Max();


            string AttendanceMessage = string.Join("\n", AttendanceBuilder.Select(x => x.ToString()));
            if (AttendanceBuilder.Count() > 0)
            {
                AttendanceMessage = ">>> " + AttendanceMessage;
            }
            AttendanceMessage = AttendanceMessage + new string(ZWC, Max - AttendanceBuilder.Count());
            Builder.AddField($"✅ Attending ({AttendanceBuilder.Count()})", AttendanceMessage, true);

            string TentativeMessage = string.Join("\n", TentativeBuilder.Select(x => x.ToString()));
            if (TentativeBuilder.Count() > 0)
            {
                TentativeMessage = ">>> " + TentativeMessage;
            }
            TentativeMessage = TentativeMessage + new string(ZWC, Max - TentativeBuilder.Count());
            Builder.AddField($"☑️ Tentative ({TentativeBuilder.Count()})", TentativeMessage, true);

            DiscordMessageBuilder MBuilder = new DiscordMessageBuilder().AddEmbed(Builder);
            if (withInteractions)
            {
                MBuilder.AddComponents(AcceptButton, TentativeButton, Delete);
            }
            return MBuilder;
        }



        /*
Use <t:TIMESTAMP:FLAG> to send it

Available flags:

    t: Short time (e.g 9:41 PM)

    T: Long Time (e.g. 9:41:30 PM)

    d: Short Date (e.g. 30/06/2021)

    D: Long Date (e.g. 30 June 2021)

    f (default): Short Date/Time (e.g. 30 June 2021 9:41 PM)

    F: Long Date/Time (e.g. Wednesday, June, 30, 2021 9:41 PM)

    R: Relative Time (e.g. 2 months ago, in an hour)

*/
        public string GetStartTime(DiscordDateTimeFormatting DDTF = DiscordDateTimeFormatting.F)
        {
            var TZI = TimeZoneInfo.GetSystemTimeZones().FirstOrDefault(x => x.DisplayName.Contains(TimeZone));
            DateTimeOffset temp = TimeZoneInfo.ConvertTime(StartTime, TimeZoneInfo.Local, TZI);
            return $"<t:{temp.ToUnixTimeSeconds()}:{DDTF.ToString()}>";
        }
        public string GetEndTime(DiscordDateTimeFormatting DDTF = DiscordDateTimeFormatting.R)
        {
            var TZI = TimeZoneInfo.GetSystemTimeZones().FirstOrDefault(x => x.DisplayName.Contains(TimeZone));
            DateTimeOffset temp = TimeZoneInfo.ConvertTime(EndTime, TimeZoneInfo.Local, TZI);
            return $"<t:{temp.ToUnixTimeSeconds()}:{DDTF.ToString()}>";
        }

        public string GetDiscordFormattedTimeMessage()
        {
            return $"{GetStartTime()} Duration: {FormattedDuration()}";
        }

        public string GetDiscordFormattedTimeStart()
        {
            return GetStartTime(DiscordDateTimeFormatting.R);
        }

        public TimeSpan GetDuration()
        {
            return StartTime - EndTime;
        }

        public string FormattedDuration()
        {
            var TS = EndTime - StartTime;
            var Hours = TS.Hours;
            var Mins = TS.Minutes;
            string finalTimestamp = "";

            if (Hours > 0)
            {
                finalTimestamp = Hours.ToString() + " Hours ";
            }

            if (Mins > 0)
            {
                finalTimestamp = Mins.ToString() + " Mins";
            }

            return finalTimestamp;

        }
    }


}
