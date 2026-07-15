export interface FrameSampleAsset {
  index: number;
  timestampSeconds: number;
  path: string;
}

export interface ListFramesRequest {
  frameDirectory: string;
  everySeconds: number;
}

export interface FrameCatalogPort {
  listFrames(request: ListFramesRequest): Promise<FrameSampleAsset[]>;
}
