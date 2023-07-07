using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using SchedulingAssistant.Utilities;
namespace SchedulingAssistant.Utilities
{
    internal static class GoogleCalendar
    {
        internal static Uri GetGoogleCalendarInvite(string Title, DateTime StartTime, DateTime EndTime, string? Description = null, string? Location = null)
        {
            string Base = @"https://www.google.com/calendar/render?action=TEMPLATE";
            Base = Base + @$"&text={WebUtilities.EscapeUriDataStringRfc3896(Title)}";
            if (Description != null)
            {
                Base = Base + $@"&details={WebUtilities.EscapeUriDataStringRfc3896(Description)}";
            }
            if (Location != null)
            {
                Base = Base + $@"&location={WebUtilities.EscapeUriDataStringRfc3896(Location)}";
            }


            Base = Base + $@"&dates={$"{StartTime.ToString("yyyyMMddTHHmm00Z")}/{EndTime.ToString("yyyyMMddTHHmm00Z")}"}";

            return new(Base);
        }

    }
}
