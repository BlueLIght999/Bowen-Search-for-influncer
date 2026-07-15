import { describe, expect, it, vi } from "vitest";
import type { VideoStoragePort } from "../src/application/ports/VideoStoragePort";
import { uploadVideoAsset } from "../src/application/useCases/uploadVideoAsset";

describe("uploadVideoAsset", () => {
  it("stores a uniquely identified video asset through the storage port", async () => {
    const storage: VideoStoragePort = {
      saveVideo: vi.fn(async (request) => ({
        id: request.id,
        fileName: request.fileName,
        storagePath: `storage/uploads/${request.id}-${request.fileName}`
      })),
      findVideoById: vi.fn(async () => null)
    };

    const result = await uploadVideoAsset({
      request: {
        assetId: "video_123",
        fileName: "demo.mp4",
        data: Buffer.from("video")
      },
      storage
    });

    expect(storage.saveVideo).toHaveBeenCalledWith({
      id: "video_123",
      fileName: "demo.mp4",
      data: Buffer.from("video")
    });
    expect(result).toEqual({
      id: "video_123",
      fileName: "demo.mp4",
      storagePath: "storage/uploads/video_123-demo.mp4"
    });
  });
});
