using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SchedulingAssistant.Entities
{
    public partial class Attendence
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }
        public int ScheduleId { get; set; }
        public ulong UserId { get; set; }
        public string Name { get; set; }
        public string Status { get; set; } = "Attending";

        public Attendence(int ScheduleId, ulong UserId, string Name, string Status = "Attending") {
            if (Status == null) throw new ArgumentNullException("Not Valid Status");
            else if (Status == "Attending" || Status == "Tentative" || Status == "Not Attending")
            {
                this.ScheduleId = ScheduleId;
                this.UserId = UserId;
                this.Name = Name;
                this.Status = Status;
            }
            else
            {
                throw new ArgumentNullException("Not Valid Status");
            }
        }
    }
}
