using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SchedulingAssistant.Entities
{
    public partial class ServerSetting
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }
        public ulong ServerId { get; set; }
        public ulong? ChannelId { get; set; } = default(ulong?);
        public ulong? ThreadId { get; set; } = default(ulong?);
        public bool IsBanned { get; set; } = false;
        public ServerSetting(ulong ServerId)
        {
            this.ServerId = ServerId;
        }

        public async Task Update()
        {
            using (var db = new DBEntities())
            {
                ServerSetting? SS = db.ServerSettings.FirstOrDefault(x => x.Id == this.Id);
                if (SS == null) // Add
                {
                    db.ServerSettings.Add(this);
                }
                else // Update
                {
                    SS.ServerId = this.ServerId;
                    SS.ChannelId = this.ChannelId;
                    SS.ThreadId = this.ThreadId;
                    SS.IsBanned = this.IsBanned;
                }
                await db.SaveChangesAsync();
            }
        }

        public async Task Delete()
        {
            using (var db = new DBEntities())
            {
                var SS = db.ServerSettings.FirstOrDefault(x => x.Id == this.Id);
                if (SS != null)
                {
                    db.ServerSettings.Remove(SS);
                    await db.SaveChangesAsync();
                }
            }
        }
    }
}
