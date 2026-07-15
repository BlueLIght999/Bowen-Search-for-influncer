import { describe, expect, it, vi } from "vitest";
import { LocalBackgroundTaskScheduler } from "../src/infrastructure/jobs/LocalBackgroundTaskScheduler";

describe("LocalBackgroundTaskScheduler", () => {
  it("runs a task after schedule returns", async () => {
    const events: string[] = [];
    const scheduler = new LocalBackgroundTaskScheduler({
      defer: (callback) => {
        events.push("deferred");
        callback();
      }
    });

    scheduler.schedule({
      id: "job_123",
      execute: async () => {
        events.push("executed");
      }
    });
    events.push("returned");

    await scheduler.waitForIdle();

    expect(events).toEqual(["deferred", "returned", "executed"]);
  });

  it("reports task failures without leaving an unhandled rejection", async () => {
    const onError = vi.fn();
    const scheduler = new LocalBackgroundTaskScheduler({ onError });

    scheduler.schedule({
      id: "job_failed",
      execute: async () => {
        throw new Error("analysis failed");
      }
    });

    await scheduler.waitForIdle();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "job_failed",
        error: expect.objectContaining({ message: "analysis failed" })
      })
    );
  });
});
