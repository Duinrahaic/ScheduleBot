import type { Knex } from "knex";
import type {
  Attendance,
  AttendanceStatus,
  NewSchedule,
  Schedule,
  ServerSetting,
} from "./domain.js";

interface ScheduleRow {
  Id: number;
  StartTime: Date | string | number;
  EndTime: Date | string | number;
  TimeZone: string;
  ServerId: string | number;
  EventId: string | number;
  ThreadId: string | number | null;
  EventTitle: string;
  EventDescription: string | null;
  WorldLink: string | null;
  HostId: string | number;
  RoleId: string | number | null;
  HostName: string;
  HostURL: string;
  ImageURL: string | null;
  IsActive: boolean | number;
  HasEnded: boolean | number;
}

interface AttendanceRow {
  Id: number;
  ScheduleId: number;
  UserId: string | number;
  Name: string;
  Status: AttendanceStatus;
}

interface SettingRow {
  Id: number;
  ServerId: string | number;
  ChannelId: string | number | null;
  ThreadId: string | number | null;
  IsBanned: boolean | number;
}

const id = (value: string | number): string => String(value);
const optionalId = (value: string | number | null): string | null =>
  value === null ? null : id(value);
const date = (value: Date | string | number): Date => {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  return new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
};

function mapSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.Id,
    startTime: date(row.StartTime),
    endTime: date(row.EndTime),
    timeZone: row.TimeZone,
    serverId: id(row.ServerId),
    eventId: id(row.EventId),
    threadId: optionalId(row.ThreadId),
    eventTitle: row.EventTitle,
    eventDescription: row.EventDescription,
    worldLink: row.WorldLink,
    hostId: id(row.HostId),
    roleId: optionalId(row.RoleId),
    hostName: row.HostName,
    hostUrl: row.HostURL,
    imageUrl: row.ImageURL,
    isActive: Boolean(row.IsActive),
    hasEnded: Boolean(row.HasEnded),
  };
}

const mapAttendance = (row: AttendanceRow): Attendance => ({
  id: row.Id,
  scheduleId: row.ScheduleId,
  userId: id(row.UserId),
  name: row.Name,
  status: row.Status,
});
const mapSetting = (row: SettingRow): ServerSetting => ({
  id: row.Id,
  serverId: id(row.ServerId),
  channelId: optionalId(row.ChannelId),
  threadId: optionalId(row.ThreadId),
  isBanned: Boolean(row.IsBanned),
});

export type ToggleResult = {
  status: AttendanceStatus | null;
  changed: "added" | "updated" | "removed";
};

export type AttendanceUpdate = {
  result: ToggleResult;
  attendance: Attendance[];
};

class KeyedSerialExecutor {
  private readonly tails = new Map<number, Promise<void>>();

  public async run<T>(key: number, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release = (): void => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.tails.set(key, tail);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}

export class Repository {
  private readonly attendanceSerial = new KeyedSerialExecutor();

  public constructor(private readonly db: Knex) {}

  public async getSetting(serverId: string): Promise<ServerSetting | null> {
    const row = await this.db<SettingRow>("ServerSettings")
      .where("ServerId", serverId)
      .first();
    return row ? mapSetting(row) : null;
  }

  public async setEventChannel(
    serverId: string,
    channelId: string,
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const row = await transaction<SettingRow>("ServerSettings")
        .where("ServerId", serverId)
        .first();
      if (row && optionalId(row.ChannelId) !== channelId) {
        const unfinished = await transaction<ScheduleRow>("Schedules")
          .where({ ServerId: serverId, HasEnded: false })
          .first("Id");
        if (unfinished)
          throw new Error(
            "The event channel cannot be changed while unfinished events exist",
          );
      }
      if (row)
        await transaction("ServerSettings")
          .where("Id", row.Id)
          .update({ ChannelId: channelId });
      else
        await transaction("ServerSettings").insert({
          ServerId: serverId,
          ChannelId: channelId,
          ThreadId: null,
          IsBanned: false,
        });
    });
  }

  public async createSchedule(event: NewSchedule): Promise<Schedule> {
    const result = await this.db("Schedules").insert({
      StartTime: event.startTime,
      EndTime: event.endTime,
      TimeZone: event.timeZone,
      ServerId: event.serverId,
      EventId: event.eventId ?? "0",
      ThreadId: null,
      EventTitle: event.eventTitle,
      EventDescription: event.eventDescription,
      WorldLink: event.worldLink,
      HostId: event.hostId,
      RoleId: event.roleId,
      HostName: event.hostName,
      HostURL: event.hostUrl,
      ImageURL: event.imageUrl,
      IsActive: false,
      HasEnded: false,
    });
    const created = await this.getScheduleById(Number(result[0]));
    if (!created) throw new Error("Database did not return the created event");
    return created;
  }

  public async getScheduleById(scheduleId: number): Promise<Schedule | null> {
    const row = await this.db<ScheduleRow>("Schedules")
      .where("Id", scheduleId)
      .first();
    return row ? mapSchedule(row) : null;
  }

  public async getScheduleByMessage(
    serverId: string,
    eventId: string,
  ): Promise<Schedule | null> {
    const row = await this.db<ScheduleRow>("Schedules")
      .where({ ServerId: serverId, EventId: eventId })
      .first();
    return row ? mapSchedule(row) : null;
  }

  public async listSchedules(serverId?: string): Promise<Schedule[]> {
    const query = this.db<ScheduleRow>("Schedules");
    if (serverId) query.where("ServerId", serverId);
    return (await query.select()).map(mapSchedule);
  }

  public async listAttendance(scheduleId: number): Promise<Attendance[]> {
    return (
      await this.db<AttendanceRow>("Attenants")
        .where("ScheduleId", scheduleId)
        .select()
    ).map(mapAttendance);
  }

  public async updateSchedule(
    scheduleId: number,
    values: Partial<Omit<Schedule, "id">>,
  ): Promise<void> {
    const row: Record<string, unknown> = {};
    const columns: Record<keyof Omit<Schedule, "id">, string> = {
      startTime: "StartTime",
      endTime: "EndTime",
      timeZone: "TimeZone",
      serverId: "ServerId",
      eventId: "EventId",
      threadId: "ThreadId",
      eventTitle: "EventTitle",
      eventDescription: "EventDescription",
      worldLink: "WorldLink",
      hostId: "HostId",
      roleId: "RoleId",
      hostName: "HostName",
      hostUrl: "HostURL",
      imageUrl: "ImageURL",
      isActive: "IsActive",
      hasEnded: "HasEnded",
    };
    for (const key of Object.keys(values) as (keyof typeof values)[])
      row[columns[key]] = values[key];
    if (Object.keys(row).length)
      await this.db("Schedules").where("Id", scheduleId).update(row);
  }

  public async deleteSchedule(scheduleId: number): Promise<void> {
    await this.db("Schedules").where("Id", scheduleId).delete();
  }

  private async toggleAttendanceTransaction(
    scheduleId: number,
    userId: string,
    name: string,
    desired: AttendanceStatus,
  ): Promise<ToggleResult> {
    return this.db.transaction(async (transaction) => {
      const existing = await transaction<AttendanceRow>("Attenants")
        .where({ ScheduleId: scheduleId, UserId: userId })
        .forUpdate()
        .first();
      if (!existing) {
        try {
          await transaction("Attenants").insert({
            ScheduleId: scheduleId,
            UserId: userId,
            Name: name,
            Status: desired,
          });
          return { status: desired, changed: "added" };
        } catch (error) {
          const conflict = await transaction<AttendanceRow>("Attenants")
            .where({ ScheduleId: scheduleId, UserId: userId })
            .forUpdate()
            .first();
          if (!conflict) throw error;
          if (conflict.Status === desired) {
            await transaction("Attenants").where("Id", conflict.Id).delete();
            return { status: null, changed: "removed" };
          }
          await transaction("Attenants")
            .where("Id", conflict.Id)
            .update({ Name: name, Status: desired });
          return { status: desired, changed: "updated" };
        }
      }
      if (existing.Status === desired) {
        await transaction("Attenants").where("Id", existing.Id).delete();
        return { status: null, changed: "removed" };
      }
      await transaction("Attenants")
        .where("Id", existing.Id)
        .update({ Name: name, Status: desired });
      return { status: desired, changed: "updated" };
    });
  }

  public async updateAttendance(
    scheduleId: number,
    userId: string,
    name: string,
    desired: AttendanceStatus,
    apply: (update: AttendanceUpdate) => Promise<void> = () =>
      Promise.resolve(),
  ): Promise<AttendanceUpdate> {
    return this.attendanceSerial.run(scheduleId, async () => {
      const result = await this.toggleAttendanceTransaction(
        scheduleId,
        userId,
        name,
        desired,
      );
      const update = {
        result,
        attendance: await this.listAttendance(scheduleId),
      };
      await apply(update);
      return update;
    });
  }

  public async toggleAttendance(
    scheduleId: number,
    userId: string,
    name: string,
    desired: AttendanceStatus,
  ): Promise<ToggleResult> {
    return (await this.updateAttendance(scheduleId, userId, name, desired))
      .result;
  }

  public async attendanceReport(
    serverId: string,
    start: Date,
    end: Date,
  ): Promise<Array<Schedule & { attendance: Attendance[] }>> {
    const rows = (
      await this.db<ScheduleRow>("Schedules")
        .where("ServerId", serverId)
        .andWhere("StartTime", ">=", start)
        .andWhere("EndTime", "<=", end)
        .andWhere("HasEnded", true)
    ).map(mapSchedule);
    return Promise.all(
      rows.map(async (schedule) => ({
        ...schedule,
        attendance: await this.listAttendance(schedule.id),
      })),
    );
  }
}
