using DSharpPlus.SlashCommands;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SchedulingAssistant.Models
{
    public enum YesNoChoice
    {
        [ChoiceName("Yes")]
        Yes,
        [ChoiceName("No")]
        No
    }
}
