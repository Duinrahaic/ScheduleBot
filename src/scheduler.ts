import type { Schedule } from "./domain.js";
import type { Logger } from "./logger.js";

export type SchedulerTransition = {
  schedule: Schedule;
  action: "start" | "end" | "cleanup";
};

export interface SchedulerTransitionStore {
  updateSchedule(
    scheduleId: number,
    values: Partial<Omit<Schedule, "id">>,
  ): Promise<void>;
}

export interface SchedulerTransitionEffects {
  ensureThread(schedule: Schedule): Promise<string>;
  announceStart(schedule: Schedule, threadId: string): Promise<void>;
  renderEndedEvent(schedule: Schedule): Promise<void>;
  announceEnd(schedule: Schedule): Promise<void>;
  deleteRole(schedule: Schedule): Promise<void>;
  archiveThread(schedule: Schedule): Promise<void>;
}

export class SchedulerTransitionApplier {
  public constructor(
    private readonly store: SchedulerTransitionStore,
    private readonly effects: SchedulerTransitionEffects,
    private readonly logger: Logger,
  ) {}

  private async optional(
    label: string,
    work: () => Promise<void>,
  ): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.warn(label, error);
    }
  }

  public async apply(transition: SchedulerTransition): Promise<void> {
    const { action, schedule } = transition;
    if (action === "start") {
      let threadId = schedule.threadId;
      if (!threadId) {
        // ensureThread recovers the thread attached to the event message when a
        // prior attempt created it but failed to persist its ID.
        threadId = await this.effects.ensureThread(schedule);
        await this.store.updateSchedule(schedule.id, { threadId });
      }
      await this.store.updateSchedule(schedule.id, { isActive: true });
      await this.optional(
        `Could not announce the start of event ${schedule.id}`,
        () => this.effects.announceStart(schedule, threadId),
      );
      return;
    }

    if (action === "end") {
      const ended = { ...schedule, isActive: true, hasEnded: true };
      // Editing the idempotent event card is required before lifecycle state
      // advances, so a Discord failure is retried on the next scheduler tick.
      await this.effects.renderEndedEvent(ended);
      await this.store.updateSchedule(schedule.id, {
        isActive: true,
        hasEnded: true,
      });
      await this.optional(
        `Could not announce the end of event ${schedule.id}`,
        () => this.effects.announceEnd(ended),
      );
      return;
    }

    // Cleanup effects are idempotent and required. The Discord adapter treats
    // resources which are already missing or archived as successful cleanup.
    await this.effects.deleteRole(schedule);
    await this.effects.archiveThread(schedule);
    await this.store.updateSchedule(schedule.id, { isActive: false });
  }
}

export function selectTransitions(
  schedules: Schedule[],
  now: Date,
  leadMinutes: number,
  cleanupMinutes: number,
): SchedulerTransition[] {
  const leadTime = now.getTime() + leadMinutes * 60_000;
  const result: SchedulerTransition[] = [];
  for (const schedule of schedules) {
    if (
      schedule.hasEnded &&
      schedule.isActive &&
      schedule.endTime.getTime() + cleanupMinutes * 60_000 <= now.getTime()
    ) {
      result.push({ schedule, action: "cleanup" });
    } else if (!schedule.hasEnded && schedule.endTime <= now) {
      result.push({ schedule, action: "end" });
    } else if (
      !schedule.hasEnded &&
      !schedule.isActive &&
      schedule.startTime.getTime() <= leadTime
    ) {
      result.push({ schedule, action: "start" });
    }
  }
  return result;
}

export class NonOverlappingScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly intervalMs: number,
    private readonly tick: () => Promise<void>,
    private readonly logger: Logger,
  ) {}

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    void this.runOnce();
  }

  public async runOnce(): Promise<boolean> {
    if (this.running) {
      this.logger.warn(
        "Skipping scheduler tick because the previous tick is still running",
      );
      return false;
    }
    this.running = true;
    try {
      await this.tick();
      return true;
    } catch (error) {
      this.logger.error("Scheduler tick failed", error);
      return false;
    } finally {
      this.running = false;
    }
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
