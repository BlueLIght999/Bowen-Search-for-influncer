import type {
  BackgroundTask,
  BackgroundTaskSchedulerPort
} from "../../application/ports/BackgroundTaskSchedulerPort";

interface LocalBackgroundTaskSchedulerOptions {
  defer?: (callback: () => void) => void;
  onError?: (event: { taskId: string; error: Error }) => void;
}

export class LocalBackgroundTaskScheduler implements BackgroundTaskSchedulerPort {
  private readonly pending = new Set<Promise<void>>();
  private readonly defer: (callback: () => void) => void;
  private readonly onError: (event: { taskId: string; error: Error }) => void;

  constructor(options: LocalBackgroundTaskSchedulerOptions = {}) {
    this.defer = options.defer ?? ((callback) => setTimeout(callback, 0));
    this.onError =
      options.onError ??
      ((event) => {
        console.error("Background video analysis task failed.", event);
      });
  }

  schedule(task: BackgroundTask): void {
    const execution = new Promise<void>((resolve) => {
      this.defer(() => {
        Promise.resolve()
          .then(() => task.execute())
          .catch((error: unknown) => {
            this.onError({
              taskId: task.id,
              error: normalizeError(error)
            });
          })
          .finally(resolve);
      });
    }).finally(() => {
      this.pending.delete(execution);
    });

    this.pending.add(execution);
  }

  async waitForIdle(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }
}

export const localBackgroundTaskScheduler = new LocalBackgroundTaskScheduler();

function normalizeError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("Unknown background video analysis failure.", { cause: error });
}
