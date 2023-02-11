using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SchedulingAssistant.Models
{
    public enum DiscordDateTimeFormatting
    {
        [Display(Name = "Short time (e.g 9:41 PM)")]
        t,
        [Display(Name = "Long Time (e.g. 9:41:30 PM)")]
        T,
        [Display(Name = "Short Date (e.g. 30/06/2021)")]
        d,
        [Display(Name = "Long Date (e.g. 30 June 2021)")]
        D,
        [Display(Name = "Short Date/Time (e.g. 30 June 2021 9:41 PM)")]
        f,
        [Display(Name = "Long Date/Time (e.g. Wednesday, June, 30, 2021 9:41 PM)")]
        F,
        [Display(Name = "Relative Time (e.g. 2 months ago, in an hour)")]
        R
    }
}
