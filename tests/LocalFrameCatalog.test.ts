import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalFrameCatalog } from "../src/infrastructure/media/LocalFrameCatalog";

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe("LocalFrameCatalog", () => {
  it("lists sampled frame images in order with derived timestamps", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-frames-"));
    const frameDirectory = join(tempRoot, "frames");
    await mkdir(frameDirectory, { recursive: true });
    await writeFile(join(frameDirectory, "frame-002.jpg"), "frame two");
    await writeFile(join(frameDirectory, "frame-001.jpg"), "frame one");
    await writeFile(join(frameDirectory, "notes.txt"), "ignore");

    const catalog = new LocalFrameCatalog();
    const frames = await catalog.listFrames({
      frameDirectory,
      everySeconds: 5
    });

    expect(frames).toEqual([
      {
        index: 1,
        timestampSeconds: 0,
        path: join(frameDirectory, "frame-001.jpg")
      },
      {
        index: 2,
        timestampSeconds: 5,
        path: join(frameDirectory, "frame-002.jpg")
      }
    ]);
  });

  it("returns an empty list when the frame directory is unavailable", async () => {
    const catalog = new LocalFrameCatalog();

    const frames = await catalog.listFrames({
      frameDirectory: "missing-frame-directory",
      everySeconds: 5
    });

    expect(frames).toEqual([]);
  });
});
