using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SchedulingAssistant.Models
{
    public class ReportOutput
    {
        public DateTime Date { get; set; }
        public ulong EventId { get; set; }
        public string Name { get; set; }
        public string? Description { get; set; }
        public ulong UserId { get; set; }
        public string UserName { get; set; }
    }
}
