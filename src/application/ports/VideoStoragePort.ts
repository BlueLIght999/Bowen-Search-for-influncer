export interface SaveVideoRequest {
  id: string;
  fileName: string;
  data: Buffer;
}

export interface StoredVideoAsset {
  id: string;
  fileName: string;
  storagePath: string;
}

export interface VideoStoragePort {
  saveVideo(request: SaveVideoRequest): Promise<StoredVideoAsset>;
  findVideoById(videoId: string): Promise<StoredVideoAsset | null>;
}
