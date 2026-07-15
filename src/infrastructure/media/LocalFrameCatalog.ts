import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  FrameCatalogPort,
  FrameSampleAsset,
  ListFramesRequest
} from "../../application/ports/FrameCatalogPort";

const FRAME_FILE_PATTERN = /^frame-(\d+)\.(jpg|jpeg|png|webp)$/i;

export class LocalFrameCatalog implements FrameCatalogPort {
  async listFrames(request: ListFramesRequest): Promise<FrameSampleAsset[]> {
    let fileNames: string[];
    try {
      fileNames = await readdir(request.frameDirectory);
    } catch {
      return [];
    }

    const everySeconds = Math.max(1, Math.round(request.everySeconds));

    return fileNames
      .map((fileName) => {
        const match = fileName.match(FRAME_FILE_PATTERN);
        if (!match) {
          return null;
        }

        const index = Number(match[1]);
        return {
          index,
          timestampSeconds: Math.max(0, index - 1) * everySeconds,
          path: join(request.frameDirectory, fileName)
        };
      })
      .filter((item): item is FrameSampleAsset => item !== null)
      .sort((a, b) => a.index - b.index);
  }
}
