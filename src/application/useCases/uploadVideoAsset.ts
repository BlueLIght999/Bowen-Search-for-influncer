import type {
  StoredVideoAsset,
  VideoStoragePort
} from "../ports/VideoStoragePort";

export interface UploadVideoAssetRequest {
  assetId: string;
  fileName: string;
  data: Buffer;
}

export async function uploadVideoAsset({
  request,
  storage
}: {
  request: UploadVideoAssetRequest;
  storage: VideoStoragePort;
}): Promise<StoredVideoAsset> {
  return storage.saveVideo({
    id: request.assetId,
    fileName: request.fileName,
    data: request.data
  });
}
