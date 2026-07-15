export interface BackgroundTask {
  id: string;
  execute(): Promise<void>;
}

export interface BackgroundTaskSchedulerPort {
  schedule(task: BackgroundTask): void;
}
