import { describe, expect, it, vi } from "vitest";
import type { Schedule } from "../src/domain.js";
import {
  NonOverlappingScheduler,
  SchedulerTransitionApplier,
  selectTransitions,
  type SchedulerTransitionEffects,
} from "../src/scheduler.js";

const event = (values: Partial<Schedule> = {}): Schedule => ({
  id: 1,
  startTime: new Date("2024-01-01T12:00:00Z"),
  endTime: new Date("2024-01-01T13:00:00Z"),
  timeZone: "UTC",
  serverId: "1",
  eventId: "2",
  threadId: null,
  eventTitle: "Event",
  eventDescription: null,
  worldLink: null,
  hostId: "3",
  roleId: "4",
  hostName: "Host",
  hostUrl: "https://example.com",
  imageUrl: null,
  isActive: false,
  hasEnded: false,
  ...values,
});

const logger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const effects = (): SchedulerTransitionEffects => ({
  ensureThread: vi.fn().mockResolvedValue("99"),
  announceStart: vi.fn().mockResolvedValue(undefined),
  renderEndedEvent: vi.fn().mockResolvedValue(undefined),
  announceEnd: vi.fn().mockResolvedValue(undefined),
  deleteRole: vi.fn().mockResolvedValue(undefined),
  archiveThread: vi.fn().mockResolvedValue(undefined),
});

describe("scheduler", () => {
  it("selects start, end, and cleanup transitions with priority", () => {
    const now = new Date("2024-01-01T14:00:00Z");
    const transitions = selectTransitions(
      [
        event({
          id: 1,
          startTime: new Date("2024-01-01T14:30:00Z"),
          endTime: new Date("2024-01-01T15:30:00Z"),
        }),
        event({ id: 2, endTime: new Date("2024-01-01T13:30:00Z") }),
        event({
          id: 3,
          endTime: new Date("2024-01-01T12:00:00Z"),
          hasEnded: true,
          isActive: true,
        }),
      ],
      now,
      60,
      60,
    );
    expect(transitions.map(({ action }) => action)).toEqual([
      "start",
      "end",
      "cleanup",
    ]);
  });

  it("persists a created thread before lifecycle state and isolates announcement failures", async () => {
    const calls: Array<Partial<Omit<Schedule, "id">>> = [];
    const store = {
      updateSchedule: vi.fn(
        (scheduleId: number, values: Partial<Omit<Schedule, "id">>) => {
          expect(scheduleId).toBe(1);
          calls.push(values);
          return Promise.resolve();
        },
      ),
    };
    const sideEffects = effects();
    vi.mocked(sideEffects.announceStart).mockRejectedValueOnce(
      new Error("Discord unavailable"),
    );
    const log = logger();
    await new SchedulerTransitionApplier(store, sideEffects, log).apply({
      action: "start",
      schedule: event(),
    });
    expect(calls).toEqual([{ threadId: "99" }, { isActive: true }]);
    expect(sideEffects.announceStart).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      "99",
    );
    expect(log.warn).toHaveBeenCalledOnce();
  });

  it("keeps a start inactive when ensuring its thread fails", async () => {
    const store = { updateSchedule: vi.fn().mockResolvedValue(undefined) };
    const sideEffects = effects();
    vi.mocked(sideEffects.ensureThread).mockRejectedValueOnce(
      new Error("Discord unavailable"),
    );
    await expect(
      new SchedulerTransitionApplier(store, sideEffects, logger()).apply({
        action: "start",
        schedule: event(),
      }),
    ).rejects.toThrow("Discord unavailable");
    expect(store.updateSchedule).not.toHaveBeenCalled();
  });

  it("reuses the ensured message thread after thread-ID persistence fails", async () => {
    const store = {
      updateSchedule: vi
        .fn()
        .mockRejectedValueOnce(new Error("database busy"))
        .mockResolvedValue(undefined),
    };
    const sideEffects = effects();
    const applier = new SchedulerTransitionApplier(
      store,
      sideEffects,
      logger(),
    );
    const transition = { action: "start" as const, schedule: event() };

    await expect(applier.apply(transition)).rejects.toThrow("database busy");
    expect(sideEffects.announceStart).not.toHaveBeenCalled();
    await applier.apply(transition);

    expect(sideEffects.ensureThread).toHaveBeenCalledTimes(2);
    expect(store.updateSchedule).toHaveBeenNthCalledWith(2, 1, {
      threadId: "99",
    });
    expect(store.updateSchedule).toHaveBeenNthCalledWith(3, 1, {
      isActive: true,
    });
  });

  it("retries required end rendering before persisting ended state", async () => {
    const store = { updateSchedule: vi.fn().mockResolvedValue(undefined) };
    const sideEffects = effects();
    vi.mocked(sideEffects.renderEndedEvent)
      .mockRejectedValueOnce(new Error("Discord unavailable"))
      .mockResolvedValue(undefined);
    const applier = new SchedulerTransitionApplier(
      store,
      sideEffects,
      logger(),
    );
    const transition = { action: "end" as const, schedule: event() };

    await expect(applier.apply(transition)).rejects.toThrow(
      "Discord unavailable",
    );
    expect(store.updateSchedule).not.toHaveBeenCalled();
    await applier.apply(transition);

    expect(sideEffects.renderEndedEvent).toHaveBeenCalledTimes(2);
    expect(store.updateSchedule).toHaveBeenCalledWith(1, {
      isActive: true,
      hasEnded: true,
    });
  });

  it("retries required cleanup before clearing active state", async () => {
    const store = { updateSchedule: vi.fn().mockResolvedValue(undefined) };
    const sideEffects = effects();
    vi.mocked(sideEffects.archiveThread)
      .mockRejectedValueOnce(new Error("Discord unavailable"))
      .mockResolvedValue(undefined);
    const applier = new SchedulerTransitionApplier(
      store,
      sideEffects,
      logger(),
    );
    const transition = {
      action: "cleanup" as const,
      schedule: event({ hasEnded: true, isActive: true }),
    };

    await expect(applier.apply(transition)).rejects.toThrow(
      "Discord unavailable",
    );
    expect(store.updateSchedule).not.toHaveBeenCalled();
    await applier.apply(transition);

    expect(sideEffects.deleteRole).toHaveBeenCalledTimes(2);
    expect(sideEffects.archiveThread).toHaveBeenCalledTimes(2);
    expect(store.updateSchedule).toHaveBeenCalledWith(1, { isActive: false });
  });

  it("does not overlap ticks", async () => {
    let release = (): void => undefined;
    const work = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tick = vi.fn(() => work);
    const scheduler = new NonOverlappingScheduler(1000, tick, logger());
    const first = scheduler.runOnce();
    expect(await scheduler.runOnce()).toBe(false);
    expect(tick).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toBe(true);
  });
});
