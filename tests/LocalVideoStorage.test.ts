import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalVideoStorage } from "../src/infrastructure/storage/LocalVideoStorage";

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe("LocalVideoStorage", () => {
  it("stores an uploaded video buffer under the configured uploads directory", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-storage-"));
    const storage = new LocalVideoStorage(tempRoot);

    const result = await storage.saveVideo({
      id: "video_abc",
      fileName: "Demo Video.mp4",
      data: Buffer.from("fake video bytes")
    });

    expect(result.id).toBe("video_abc");
    expect(result.storagePath.endsWith(join("uploads", "video_abc-demo-video.mp4"))).toBe(true);
    expect(await readFile(result.storagePath, "utf8")).toBe("fake video bytes");
    await expect(storage.findVideoById("video_abc")).resolves.toEqual(result);
  });

  it("returns null when the requested video asset does not exist", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-storage-"));
    const storage = new LocalVideoStorage(tempRoot);

    await expect(storage.findVideoById("video_missing")).resolves.toBeNull();
  });
});
