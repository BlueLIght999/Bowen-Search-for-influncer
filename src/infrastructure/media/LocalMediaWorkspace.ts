import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  MediaWorkspace,
  MediaWorkspacePort
} from "../../application/ports/MediaWorkspacePort";

export class LocalMediaWorkspace implements MediaWorkspacePort {
  constructor(
    private readonly rootDir = process.env.BOWEN_STORAGE_ROOT ?? "storage",
    private readonly everySeconds = 5
  ) {}

  async prepare(assetId: string): Promise<MediaWorkspace> {
    const audioDirectory = join(this.rootDir, "audio");
    const frameDirectory = join(this.rootDir, "frames", assetId);
    await Promise.all([
      mkdir(audioDirectory, { recursive: true }),
      mkdir(frameDirectory, { recursive: true })
    ]);

    return {
      audioPath: join(audioDirectory, `${assetId}.wav`),
      frameDirectory,
      framePattern: join(frameDirectory, "frame-%03d.jpg"),
      everySeconds: this.everySeconds
    };
  }
}
