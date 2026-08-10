export type AttendanceStatus = "Attending" | "Tentative";

export interface Schedule {
  id: number;
  startTime: Date;
  endTime: Date;
  timeZone: string;
  serverId: string;
  eventId: string;
  threadId: string | null;
  eventTitle: string;
  eventDescription: string | null;
  worldLink: string | null;
  hostId: string;
  roleId: string | null;
  hostName: string;
  hostUrl: string;
  imageUrl: string | null;
  isActive: boolean;
  hasEnded: boolean;
}

export type NewSchedule = Omit<
  Schedule,
  "id" | "eventId" | "threadId" | "isActive" | "hasEnded"
> & {
  eventId?: string;
};

export interface Attendance {
  id: number;
  scheduleId: number;
  userId: string;
  name: string;
  status: AttendanceStatus;
}

export interface ServerSetting {
  id: number;
  serverId: string;
  channelId: string | null;
  threadId: string | null;
  isBanned: boolean;
}
